.PHONY: build run test proto clean

# Epoch Engine — Logistics Service (Golang)

build:
	go build -o bin/server cmd/server/main.go

run:
	go run cmd/server/main.go

test:
	go test ./... -v -race

proto:
	cd ../shared/proto && buf generate

clean:
	rm -rf bin/

vet:
	go vet ./...

lint:
	golangci-lint run ./...
