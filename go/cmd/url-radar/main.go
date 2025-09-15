package main

import (
	"encoding/csv"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"sync"
	"time"
)

const (
	BaseURL    = "https://katalozi-bg.info/catalogs/promo-katalog-BulMag/"
	StartID    = 31106
	Count      = 15000
	OutputFile = "valid_catalogs.csv"
	LogFile    = "curl_log.txt"
	MaxWorkers = 20
	Timeout    = 10 * time.Second
)

type Result struct {
	ID       int
	URL      string
	Status   string
	FinalURL string
	HTTPCode int
	Error    string
}

func checkURL(id int, client *http.Client) Result {
	url := fmt.Sprintf("%s%d", BaseURL, id)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return Result{
			ID:     id,
			URL:    url,
			Status: "error",
			Error:  err.Error(),
		}
	}

	// Set a reasonable user agent
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; catalog-checker/1.0)")

	resp, err := client.Do(req)
	if err != nil {
		return Result{
			ID:     id,
			URL:    url,
			Status: "error",
			Error:  err.Error(),
		}
	}
	defer resp.Body.Close()

	finalURL := resp.Request.URL.String()

	// Check if redirected to homepage
	if finalURL == "https://katalozi-bg.info/" {
		return Result{
			ID:       id,
			URL:      url,
			Status:   "redirected",
			FinalURL: finalURL,
			HTTPCode: resp.StatusCode,
		}
	} else if resp.StatusCode == 200 {
		return Result{
			ID:       id,
			URL:      url,
			Status:   "valid",
			FinalURL: finalURL,
			HTTPCode: resp.StatusCode,
		}
	} else {
		return Result{
			ID:       id,
			URL:      url,
			Status:   "error",
			FinalURL: finalURL,
			HTTPCode: resp.StatusCode,
		}
	}
}

func logResult(result Result, logFile *os.File, mu *sync.Mutex) {
	timestamp := time.Now().Format("2006-01-02 15:04:05")
	var message string

	switch result.Status {
	case "valid":
		message = fmt.Sprintf("%s - ID %d: VALID catalog found!", timestamp, result.ID)
	case "redirected":
		message = fmt.Sprintf("%s - ID %d: HTTP redirected to homepage (HTTP: %d)", timestamp, result.ID, result.HTTPCode)
	case "meta_redirected":
		message = fmt.Sprintf("%s - ID %d: HTML meta redirected to homepage (HTTP: %d)", timestamp, result.ID, result.HTTPCode)
	case "error":
		if result.Error != "" {
			message = fmt.Sprintf("%s - ID %d: Error - %s", timestamp, result.ID, result.Error)
		} else {
			message = fmt.Sprintf("%s - ID %d: HTTP %d error", timestamp, result.ID, result.HTTPCode)
		}
	}

	mu.Lock()
	defer mu.Unlock()

	fmt.Fprintf(logFile, "%s\n", message)
	logFile.Sync() // Force write to disk
}

func writeValidResult(result Result, csvWriter *csv.Writer, mu *sync.Mutex) {
	if result.Status == "valid" {
		mu.Lock()
		defer mu.Unlock()

		record := []string{
			strconv.Itoa(result.ID),
			result.URL,
			result.Status,
			result.FinalURL,
			strconv.Itoa(result.HTTPCode),
		}
		csvWriter.Write(record)
		csvWriter.Flush()
	}
}

func main() {
	fmt.Printf("Starting to check %d URLs from ID %d\n", Count, StartID)
	fmt.Printf("Using %d parallel workers\n", MaxWorkers)
	fmt.Printf("Valid catalogs will be saved to: %s\n", OutputFile)
	fmt.Printf("Logs will be saved to: %s\n", LogFile)

	// Create output files
	csvFile, err := os.Create(OutputFile)
	if err != nil {
		log.Fatal("Error creating CSV file:", err)
	}
	defer csvFile.Close()

	csvWriter := csv.NewWriter(csvFile)
	defer csvWriter.Flush()

	// Write CSV header
	csvWriter.Write([]string{"catalog_id", "url", "status", "final_url", "http_code"})

	logFile, err := os.Create(LogFile)
	if err != nil {
		log.Fatal("Error creating log file:", err)
	}
	defer logFile.Close()

	fmt.Fprintf(logFile, "Starting catalog check at %s\n", time.Now().Format("2006-01-02 15:04:05"))

	// Create HTTP client with timeout
	client := &http.Client{
		Timeout: Timeout,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			// Allow redirects but track them
			return nil
		},
	}

	// Create worker pool
	jobs := make(chan int, Count)
	results := make(chan Result, Count)

	var wg sync.WaitGroup
	var logMu, csvMu sync.Mutex

	// Start workers
	for w := 0; w < MaxWorkers; w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for id := range jobs {
				result := checkURL(id, client)
				results <- result
			}
		}()
	}

	// Start result processor
	var processorWg sync.WaitGroup
	processorWg.Add(1)
	go func() {
		defer processorWg.Done()
		validCount := 0
		processedCount := 0
		startTime := time.Now()

		for result := range results {
			processedCount++

			// Log the result
			logResult(result, logFile, &logMu)

			// Write valid results to CSV
			writeValidResult(result, csvWriter, &csvMu)

			if result.Status == "valid" {
				validCount++
				fmt.Printf("Found valid catalog: ID %d\n", result.ID)
			}

			// Progress update every 1000 requests
			if processedCount%1000 == 0 {
				elapsed := time.Since(startTime)
				rate := float64(processedCount) / elapsed.Seconds()
				remaining := Count - processedCount
				eta := time.Duration(float64(remaining)/rate) * time.Second

				fmt.Printf("Processed: %d/%d, Valid: %d, Rate: %.1f req/s, ETA: %v\n",
					processedCount, Count, validCount, rate, eta)
			}
		}

		elapsed := time.Since(startTime)
		fmt.Printf("\nCompleted! Processed %d URLs in %v\n", processedCount, elapsed)
		fmt.Printf("Found %d valid catalogs\n", validCount)
		fmt.Printf("Average rate: %.1f requests/second\n", float64(processedCount)/elapsed.Seconds())
	}()

	// Send jobs
	go func() {
		defer close(jobs)
		for i := 0; i < Count; i++ {
			jobs <- StartID - i
		}
	}()

	// Wait for workers to complete
	wg.Wait()
	close(results)

	// Wait for result processor to complete
	processorWg.Wait()

	fmt.Println("Check complete! Results saved to", OutputFile)
}
