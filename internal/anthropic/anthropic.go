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

const apiURL = "https://api.anthropic.com/v1/messages"

type message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type messagesRequest struct {
	Model     string    `json:"model"`
	MaxTokens int       `json:"max_tokens"`
	Messages  []message `json:"messages"`
}

type contentBlock struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

type messagesResponse struct {
	Content []contentBlock `json:"content"`
}

// Complete はAnthropicのMessages APIを呼び出してテキストを生成します。
func Complete(prompt string) (string, error) {
	apiKey := os.Getenv("ANTHROPIC_API_KEY")
	if apiKey == "" {
		return "", errors.New("ANTHROPIC_API_KEY is not set")
	}

	payload := messagesRequest{
		Model:     "claude-haiku-4-5-20251001",
		MaxTokens: 500,
		Messages: []message{
			{Role: "user", Content: prompt},
		},
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
	req.Header.Set("x-api-key", apiKey)
	req.Header.Set("anthropic-version", "2023-06-01")

	client := &http.Client{Timeout: 30 * time.Second}
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

	var result messagesResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("failed to decode response: %w", err)
	}

	if len(result.Content) == 0 {
		return "", errors.New("empty response from anthropic")
	}

	return result.Content[0].Text, nil
}

// CallClaude は指定したプロンプトで Anthropic を呼び出します。
func CallClaude(prompt string) (string, error) {
	return Complete(prompt)
}
