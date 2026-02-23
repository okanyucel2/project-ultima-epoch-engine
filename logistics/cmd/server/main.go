package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/gin-gonic/gin"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "12065"
	}

	r := gin.Default()

	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":  "ok",
			"service": "ultima-epoch-logistics",
			"version": "0.1.0",
			"time":    time.Now().UTC().Format(time.RFC3339),
		})
	})

	r.GET("/api/simulation/status", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"refineries": 0,
			"mines":      0,
			"resources": gin.H{
				"sim":     0,
				"rapidlum": 0,
				"mineral": 0,
			},
			"rebellion_probability": 0.0,
		})
	})

	addr := fmt.Sprintf(":%s", port)
	log.Printf("[Logistics] Golang backend online — port %s", port)
	if err := r.Run(addr); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
