package anthropic

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"time"
)

const apiURL = "https://api.anthropic.com/v1/complete"

// CompleteRequest はAnthropicの完了APIリクエストです。
type CompleteRequest struct {
	Model              string  `json:"model"`
	Prompt             string  `json:"prompt"`
	MaxTokensToSample  int     `json:"max_tokens_to_sample"`
	Temperature        float64 `json:"temperature"`
	TopP               float64 `json:"top_p,omitempty"`
	StopSequences      []string `json:"stop_sequences,omitempty"`
}

// CompleteResponse はAnthropicの完了APIレスポンスです。
type CompleteResponse struct {
	Completion string `json:"completion"`
}

// Complete calls the Anthropic completion API and returns the generated text.
func Complete(prompt string) (string, error) {
	apiKey := os.Getenv("ANTHROPIC_API_KEY")
	if apiKey == "" {
		return "", errors.New("ANTHROPIC_API_KEY is not set")
	}

	payload := CompleteRequest{
		Model:             "claude-3.5",
		Prompt:            prompt,
		MaxTokensToSample: 500,
		Temperature:       0.7,
		TopP:              1.0,
		StopSequences:     []string{"\n"},
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("failed to encode request: %w", err)
	}

	req, err := http.NewRequest(http.MethodPost, apiURL, bytes.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-API-Key", apiKey)

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		var errResp map[string]any
		_ = json.NewDecoder(resp.Body).Decode(&errResp)
		return "", fmt.Errorf("anthropic API error: status=%d body=%v", resp.StatusCode, errResp)
	}

	var result CompleteResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("failed to decode response: %w", err)
	}

	return result.Completion, nil
}

// CallClaude は指定したプロンプトで Anthropic を呼び出します。
func CallClaude(prompt string) (string, error) {
	return Complete(prompt)
}
