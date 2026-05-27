package weather

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
)

const openMeteoURL = "https://api.open-meteo.com/v1/forecast"

// WeatherHourly は時間帯別の天気予報データです。
type WeatherHourly struct {
	Time                     []string  `json:"time"`
	Temperature2m            []float64 `json:"temperature_2m"`
	PrecipitationProbability []float64 `json:"precipitation_probability"`
}

// WeatherForecast は Open-Meteo からの返却データです。
type WeatherForecast struct {
	Latitude  float64      `json:"latitude"`
	Longitude float64      `json:"longitude"`
	Hourly    WeatherHourly `json:"hourly"`
}

type openMeteoHourly struct {
	Time                     []string  `json:"time"`
	Temperature2m            []float64 `json:"temperature_2m"`
	PrecipitationProbability []float64 `json:"precipitation_probability"`
}

type openMeteoResponse struct {
	Hourly openMeteoHourly `json:"hourly"`
}

// FetchWeatherForecast は指定した緯度経度の時間帯別天気予報を取得します。
func FetchWeatherForecast(latitude, longitude float64) (*WeatherForecast, error) {
	url := fmt.Sprintf("%s?latitude=%f&longitude=%f&hourly=temperature_2m,precipitation_probability&timezone=Asia/Tokyo", openMeteoURL, latitude, longitude)

	resp, err := http.Get(url)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch weather forecast: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("open-meteo returned status %d", resp.StatusCode)
	}

	var omResp openMeteoResponse
	if err := json.NewDecoder(resp.Body).Decode(&omResp); err != nil {
		return nil, fmt.Errorf("failed to decode open-meteo response: %w", err)
	}

	return buildForecast(latitude, longitude, omResp)
}

func buildForecast(latitude, longitude float64, omResp openMeteoResponse) (*WeatherForecast, error) {
	total := len(omResp.Hourly.Time)
	if total == 0 {
		return nil, errors.New("open-meteo returned no hourly data")
	}

	n := total
	if n > 24 {
		n = 24
	}

	if len(omResp.Hourly.Temperature2m) < n || len(omResp.Hourly.PrecipitationProbability) < n {
		return nil, errors.New("inconsistent hourly data lengths")
	}

	return &WeatherForecast{
		Latitude:  latitude,
		Longitude: longitude,
		Hourly: WeatherHourly{
			Time:                     omResp.Hourly.Time[:n],
			Temperature2m:            omResp.Hourly.Temperature2m[:n],
			PrecipitationProbability: omResp.Hourly.PrecipitationProbability[:n],
		},
	}, nil
}

// WeatherAPI registers the /api/weather endpoint.
func WeatherAPI() {
	http.HandleFunc("/api/weather", func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		latitudeStr := q.Get("latitude")
		if latitudeStr == "" {
			latitudeStr = q.Get("lat")
		}
		longitudeStr := q.Get("longitude")
		if longitudeStr == "" {
			longitudeStr = q.Get("lon")
		}
		if longitudeStr == "" {
			longitudeStr = q.Get("lng")
		}

		latitude, err1 := strconv.ParseFloat(latitudeStr, 64)
		longitude, err2 := strconv.ParseFloat(longitudeStr, 64)
		if err1 != nil || err2 != nil {
			http.Error(w, "latitude and longitude are required and must be valid numbers", http.StatusBadRequest)
			return
		}

		forecast, err := FetchWeatherForecast(latitude, longitude)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(forecast)
	})
}
