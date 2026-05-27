package weather

import (
	"encoding/json"
	"testing"
)

func TestBuildForecast(t *testing.T) {
	sample := `{
        "hourly": {
            "time": [
                "2026-05-27T00:00",
                "2026-05-27T01:00"
            ],
            "temperature_2m": [12.1, 11.8],
            "precipitation_probability": [0.0, 5.0]
        }
    }`

	var omResp openMeteoResponse
	if err := json.Unmarshal([]byte(sample), &omResp); err != nil {
		t.Fatalf("failed to unmarshal sample response: %v", err)
	}

	forecast, err := buildForecast(35.8617, 139.6475, omResp)
	if err != nil {
		t.Fatalf("buildForecast failed: %v", err)
	}

	if len(forecast.Hourly.Time) != 2 {
		t.Fatalf("expected 2 hourly entries, got %d", len(forecast.Hourly.Time))
	}

	if forecast.Hourly.Temperature2m[0] != 12.1 {
		t.Fatalf("expected first temperature 12.1, got %f", forecast.Hourly.Temperature2m[0])
	}

	if forecast.Hourly.PrecipitationProbability[1] != 5.0 {
		t.Fatalf("expected second precipitation probability 5.0, got %f", forecast.Hourly.PrecipitationProbability[1])
	}
}
