package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/okanyucel2/project-ultima-epoch-engine/logistics/internal/economy"
	"github.com/okanyucel2/project-ultima-epoch-engine/logistics/internal/grpcserver"
	"github.com/okanyucel2/project-ultima-epoch-engine/logistics/internal/npc"
	"github.com/okanyucel2/project-ultima-epoch-engine/logistics/internal/rebellion"
	"github.com/okanyucel2/project-ultima-epoch-engine/logistics/internal/simulation"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "12065"
	}

	// Initialize engines
	rebConfig := rebellion.DefaultConfig()
	rebEngine := rebellion.NewEngine(rebConfig)
	simEngine := simulation.NewSimulationEngine(rebEngine)
	behaviorEngine := npc.NewBehaviorEngine()
	econEngine := economy.NewEconomyEngine()

	// Start gRPC server
	grpcPort := os.Getenv("GRPC_PORT")
	if grpcPort == "" {
		grpcPort = grpcserver.DefaultGRPCPort
	}
	grpcSrv := grpcserver.NewEpochGRPCServer(grpcPort, rebEngine, simEngine, behaviorEngine)
	go func() {
		if err := grpcSrv.Start(); err != nil {
			log.Fatalf("[gRPC] Failed to start: %v", err)
		}
	}()

	r := gin.Default()

	// Health check
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":  "ok",
			"service": "ultima-epoch-logistics",
			"version": "0.2.0",
			"time":    time.Now().UTC().Format(time.RFC3339),
		})
	})

	// Simulation status
	r.GET("/api/simulation/status", func(c *gin.Context) {
		status := simEngine.GetStatus()

		resources := make(map[string]gin.H)
		for rType, rState := range status.Resources {
			resources[string(rType)] = gin.H{
				"quantity":         rState.Quantity,
				"production_rate":  rState.ProductionRate,
				"consumption_rate": rState.ConsumptionRate,
			}
		}

		c.JSON(http.StatusOK, gin.H{
			"refineries":              status.Refineries,
			"mines":                   status.Mines,
			"resources":               resources,
			"overall_rebellion_prob":   status.OverallRebellionProb,
			"active_npcs":             status.ActiveNPCs,
			"tick_count":              status.TickCount,
			"infestation_level":       status.InfestationLevel,
			"is_plague_heart":         status.IsPlagueHeart,
			"throttle_multiplier":     status.ThrottleMultiplier,
		})
	})

	// Advance simulation by one tick
	r.POST("/api/simulation/tick", func(c *gin.Context) {
		status := simEngine.Tick()

		resources := make(map[string]gin.H)
		for rType, rState := range status.Resources {
			resources[string(rType)] = gin.H{
				"quantity":         rState.Quantity,
				"production_rate":  rState.ProductionRate,
				"consumption_rate": rState.ConsumptionRate,
			}
		}

		c.JSON(http.StatusOK, gin.H{
			"tick_count": status.TickCount,
			"resources":  resources,
		})
	})

	// Get rebellion probability for a specific NPC
	r.GET("/api/rebellion/probability/:npcId", func(c *gin.Context) {
		npcID := c.Param("npcId")

		npcBehavior, ok := behaviorEngine.GetNPC(npcID)
		if !ok {
			c.JSON(http.StatusNotFound, gin.H{
				"error": fmt.Sprintf("NPC %q not found", npcID),
			})
			return
		}

		profile := rebellion.NPCRebellionProfile{
			NPCID:          npcBehavior.NPCID,
			AvgTrauma:      0.0, // Trauma comes from memory graph; default 0 here
			WorkEfficiency: npcBehavior.WorkEfficiency,
			Morale:         npcBehavior.Morale,
			MemoryCount:    0,
		}

		result := rebEngine.CalculateProbability(profile)

		c.JSON(http.StatusOK, gin.H{
			"npc_id":             result.NPCID,
			"probability":        result.Probability,
			"threshold_exceeded": result.ThresholdExceeded,
			"halt_triggered":     result.HaltTriggered,
			"factors": gin.H{
				"base":                result.Factors.Base,
				"trauma_modifier":     result.Factors.TraumaModifier,
				"efficiency_modifier": result.Factors.EfficiencyModifier,
				"morale_modifier":     result.Factors.MoraleModifier,
			},
		})
	})

	// Apply an action to an NPC
	r.POST("/api/npc/:npcId/action", func(c *gin.Context) {
		npcID := c.Param("npcId")

		var req struct {
			ActionType string  `json:"action_type" binding:"required"`
			Intensity  float64 `json:"intensity" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Auto-register NPC if not exists
		behaviorEngine.RegisterNPC(npcID)

		// Apply behavioral effects
		action := rebellion.NPCAction{
			ActionID:   fmt.Sprintf("act-%d", time.Now().UnixNano()),
			NPCID:      npcID,
			ActionType: req.ActionType,
			Intensity:  req.Intensity,
		}

		// Get current profile from behavior engine
		npcBehavior, _ := behaviorEngine.GetNPC(npcID)
		profile := rebellion.NPCRebellionProfile{
			NPCID:          npcBehavior.NPCID,
			AvgTrauma:      0.0,
			WorkEfficiency: npcBehavior.WorkEfficiency,
			Morale:         npcBehavior.Morale,
			MemoryCount:    0,
		}

		updatedProfile := rebEngine.ProcessAction(profile, action)

		// Sync updated values back to behavior engine
		_ = behaviorEngine.ApplyWorkEfficiencyModifier(npcID, updatedProfile.WorkEfficiency-npcBehavior.WorkEfficiency)
		_ = behaviorEngine.ApplyMoraleModifier(npcID, updatedProfile.Morale-npcBehavior.Morale)

		// Calculate new rebellion probability
		result := rebEngine.CalculateProbability(updatedProfile)

		c.JSON(http.StatusOK, gin.H{
			"npc_id":      npcID,
			"action_type": req.ActionType,
			"updated_state": gin.H{
				"work_efficiency": updatedProfile.WorkEfficiency,
				"morale":          updatedProfile.Morale,
				"avg_trauma":      updatedProfile.AvgTrauma,
			},
			"rebellion_probability": result.Probability,
			"halt_triggered":        result.HaltTriggered,
		})
	})

	// Get resource prices
	r.GET("/api/economy/prices", func(c *gin.Context) {
		prices := make(map[string]gin.H)
		for _, rt := range []economy.ResourceType{economy.ResourceSim, economy.ResourceRapidlum, economy.ResourceMineral} {
			if p, ok := econEngine.GetPrice(rt); ok {
				prices[string(rt)] = gin.H{
					"buy_price":  p.BuyPrice,
					"sell_price": p.SellPrice,
				}
			}
		}
		c.JSON(http.StatusOK, gin.H{"prices": prices})
	})

	// Graceful shutdown
	addr := fmt.Sprintf(":%s", port)
	srv := &http.Server{
		Addr:    addr,
		Handler: r,
	}

	go func() {
		log.Printf("[Logistics] Golang backend online — port %s", port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Failed to start server: %v", err)
		}
	}()

	// Wait for interrupt signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("[Logistics] Shutting down gracefully...")

	// Stop gRPC server first (non-blocking graceful stop)
	grpcSrv.Stop()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}
	log.Println("[Logistics] Server exited cleanly")
}
