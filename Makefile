# Prepcart Crawling System Makefile
# Usage: make <target> CRAWLER=<crawler-name>

# Default values
CRAWLER ?= kaufland
REGION ?= europe-west1
PROJECT_ID ?= $(shell gcloud config get-value project 2>/dev/null)
SCHEDULE ?= 0 9 * * 1 # Default: Weekly Monday 9 AM UTC

# Colors for output
CYAN = \033[36m
GREEN = \033[32m
YELLOW = \033[33m
RED = \033[31m
NC = \033[0m # No Color

.PHONY: help build run deploy deploy-all trigger logs list-crawlers clean

help: ##@ Display this help message
	@echo ""
	@echo "Usage: make <target>"
	@echo ""
	@grep -E '(##@|##)' $(MAKEFILE_LIST) | grep -v grep | while read -r line; do \
		if [[ $$line =~ ^##@ ]]; then \
			echo ""; \
			echo "$${line####@ }"; \
		elif [[ $$line =~ ^[a-zA-Z_-]+: ]]; then \
			target=$$(echo "$$line" | cut -d':' -f1); \
			comment=$$(echo "$$line" | sed -n 's/.*## *//p'); \
			if [ -n "$$comment" ]; then \
				printf "    \033[32m%-20s\033[0m %s\n" "$$target" "$$comment"; \
			fi \
		fi \
	done
# Default target
build: ## Build Docker image for specified crawler
	@echo "$(CYAN)Building Docker image for crawler: $(CRAWLER)$(NC)"
	docker build --build-arg CRAWLER_NAME=$(CRAWLER) -t $(REGION)-docker.pkg.dev/$(PROJECT_ID)/prepcart-crawling/$(CRAWLER) .

run: ## Run crawler locally with Docker using Application Default Credentials
	@echo "$(CYAN)Running crawler locally: $(CRAWLER)$(NC)"
	@echo "$(GREEN)Using Application Default Credentials$(NC)"
	./scripts/run-crawler-locally.sh $(CRAWLER)

check-auth: ## Check if authenticated with Google Cloud
	@echo "$(CYAN)Checking Google Cloud authentication$(NC)"
	@if gcloud auth application-default print-access-token &>/dev/null; then \
		echo "$(GREEN)✓ Authenticated with Application Default Credentials$(NC)"; \
		echo "Current account: $$(gcloud auth list --filter=status:ACTIVE --format='value(account)')"; \
	else \
		echo "$(RED)✗ Not authenticated$(NC)"; \
		echo "Please run: $(YELLOW)gcloud auth application-default login$(NC)"; \
	fi

deploy: ## Deploy specified crawler as a scheduled Cloud Run Job
	@echo "$(CYAN)Deploying crawler job: $(CRAWLER) with schedule: '$(SCHEDULE)'$(NC)"
	@if [ -z "$(PROJECT_ID)" ]; then \
		echo "$(RED)Error: PROJECT_ID not set. Please set it via: export PROJECT_ID=your-project-id$(NC)"; \
		exit 1; \
	fi
	./scripts/deploy-crawler.sh $(CRAWLER) "$(SCHEDULE)" $(REGION) $(PROJECT_ID)

deploy-all: ## Deploy all crawlers with a default schedule
	@echo "$(CYAN)Deploying all crawlers with schedule '$(SCHEDULE)'...$(NC)"
	@if [ -z "$(PROJECT_ID)" ]; then \
		echo "$(RED)Error: PROJECT_ID not set. Please set it via: export PROJECT_ID=your-project-id$(NC)"; \
		exit 1; \
	fi
	./scripts/deploy-all-crawlers.sh "$(SCHEDULE)" "$(REGION)" "$(PROJECT_ID)"

trigger: ## Trigger crawler job manually on Cloud Run
	@echo "$(CYAN)Triggering job for crawler: $(CRAWLER)$(NC)"
	./scripts/trigger-job.sh $(CRAWLER) $(REGION) $(PROJECT_ID)

schedule: ## Update the schedule for an existing crawler job
	@echo "$(CYAN)Updating schedule for crawler: $(CRAWLER)$(NC)"
	./scripts/schedule-crawler.sh $(CRAWLER) "$(SCHEDULE)" $(REGION) $(PROJECT_ID)

logs: ## View logs for a deployed crawler job
	@echo "$(CYAN)Viewing logs for job: prepcart-job-$(CRAWLER)$(NC)"
	gcloud run jobs logs tail prepcart-job-$(CRAWLER) --region=$(REGION)

status: ## Show status of a deployed crawler job
	@echo "$(CYAN)Status for job: prepcart-job-$(CRAWLER)$(NC)"
	@gcloud run jobs describe prepcart-job-$(CRAWLER) --region=$(REGION) --format="table(name,lastExecution.completionTime,lastExecution.taskCount,template.spec.template.spec.containers[0].image)" 2>/dev/null || echo "$(RED)Job not found$(NC)"
	@echo "$(CYAN)Status for scheduler: prepcart-schedule-$(CRAWLER)$(NC)"
	@gcloud scheduler jobs describe prepcart-schedule-$(CRAWLER) --location=$(REGION) --format="table(name,schedule,state)" 2>/dev/null || echo "$(RED)Scheduler not found$(NC)"

list-crawlers: ## List all available crawler directories
	@echo "$(CYAN)Available katalozi subcrawlers:$(NC)"
	@find crawlers/katalozi/crawlers -maxdepth 1 -type d -not -path crawlers/katalozi/crawlers | sed 's|crawlers/katalozi/crawlers/|  - |' | sort

list-deployed: ## List all deployed crawler jobs and schedulers
	@echo "$(CYAN)Deployed crawler jobs:$(NC)"
	@gcloud run jobs list --region=$(REGION) --filter="metadata.name:prepcart-job-*" --format="table(metadata.name,metadata.creationTimestamp.date('%Y-%m-%d'),lastExecution.completionTime.date('%Y-%m-%d %H:%M'))" 2>/dev/null || echo "$(RED)No deployed jobs found$(NC)"
	@echo ""
	@echo "$(CYAN)Deployed schedulers:$(NC)"
	@gcloud scheduler jobs list --location=$(REGION) --filter="name:prepcart-schedule-*" --format="table(name,schedule,state)" 2>/dev/null || echo "$(RED)No deployed schedulers found$(NC)"

delete: ## Delete a deployed crawler job and its scheduler
	@echo "$(CYAN)Deleting crawler: $(CRAWLER)$(NC)"
	@echo "$(YELLOW)Are you sure you want to delete job 'prepcart-job-$(CRAWLER)' and scheduler 'prepcart-schedule-$(CRAWLER)'? [y/N]$(NC)" && read ans && [ $${ans:-N} = y ]
	gcloud run jobs delete prepcart-job-$(CRAWLER) --region=$(REGION) --quiet || echo "$(YELLOW)Job not found or already deleted.$(NC)"
	gcloud scheduler jobs delete prepcart-schedule-$(CRAWLER) --location=$(REGION) --quiet || echo "$(YELLOW)Scheduler not found or already deleted.$(NC)"
	@echo "$(GREEN)✅ Deletion complete.$(NC)"

clean: ## Clean up local Docker images for crawlers
	@echo "$(CYAN)Cleaning up local crawler Docker images$(NC)"
	docker images | grep prepcart-job | awk '{print $$3}' | xargs -r docker rmi -f

dev: ## Run crawler in development mode locally (with tsx watch)
	@echo "$(CYAN)Running katalozi subcrawler in development mode: $(CRAWLER)$(NC)"
	npm run dev:subcrawler --crawler=$(CRAWLER)

info: ## Show current configuration and available crawlers
	@echo "$(CYAN)Current Configuration:$(NC)"
	@echo "  Crawler: $(GREEN)$(CRAWLER)$(NC)"
	@echo "  Region: $(GREEN)$(REGION)$(NC)"
	@echo "  Project ID: $(GREEN)$(PROJECT_ID)$(NC)"
	@echo "  Default Schedule: $(GREEN)$(SCHEDULE)$(NC)"
	@echo ""
	@make check-auth
	@echo ""
	@echo "$(CYAN)Available Crawlers:$(NC)"
	@make list-crawlers 
