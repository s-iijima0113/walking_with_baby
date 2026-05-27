package anthropic

import (
	"os"
	"testing"
)

func TestCallClaude(t *testing.T) {
	if os.Getenv("ANTHROPIC_API_KEY") == "" {
		t.Skip("ANTHROPIC_API_KEY is not set")
	}

	prompt := "こんにちは。さいたま市の赤ちゃん連れ散歩コースについて、50文字以内で3つの簡潔な提案を日本語で書いてください。"
	result, err := CallClaude(prompt)
	if err != nil {
		t.Fatalf("CallClaude failed: %v", err)
	}
	if result == "" {
		t.Fatal("expected non-empty completion")
	}

	t.Logf("Anthropic completion: %s", result)
}
