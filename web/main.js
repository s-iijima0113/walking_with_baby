mapboxgl.accessToken = CONFIG.MAPBOX_TOKEN;

const WALKING_SPEED_METERS_PER_MIN = 70;
const START_COORDINATES = { lng: 139.6554, lat: 35.8577 }; // 浦和駅
const EMPTY_ROUTE = {
    type: 'FeatureCollection',
    features: []
};

let map;
let mapLoaded = false;

//facilitiedAPI取得
let facilities = [];
let coins = [];
let markers = [];
let feelMarkers = [];
let startMarker = null;

let routeMessageElement;
let weatherNow = null; // { temp: number, rain: number }

function updateRouteMessage(message, isError = false) {
    if (!routeMessageElement) {
        return;
    }
    routeMessageElement.textContent = message;
    routeMessageElement.classList.toggle('route-message--error', Boolean(isError));
}

async function loadWeather() {
    try {
        const response = await fetch(`/api/weather?lat=${START_COORDINATES.lat}&lng=${START_COORDINATES.lng}`);
        if (!response.ok) throw new Error('weather API error');
        const data = await response.json();

        // 現在の時刻に対応するインデックスを探す（例: "2026-05-27T14:00"）
        const now = new Date();
        const pad = n => String(n).padStart(2, '0');
        const currentHourStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:00`;
        const idx = data.hourly.time.indexOf(currentHourStr);

        const el = document.getElementById('weather-info');
        if (!el) return;

        if (idx === -1) {
            el.textContent = '天気情報を取得できませんでした';
            return;
        }

        const temp = data.hourly.temperature_2m[idx];
        const rain = data.hourly.precipitation_probability[idx];

        weatherNow = { temp, rain };
        const icon = rain >= 60 ? '🌧️' : rain >= 30 ? '⛅' : '☀️';
        el.textContent = `${icon} ${temp}°C　降水確率 ${rain}%`;
    } catch (error) {
        console.error('天気情報の取得に失敗しました', error);
        const el = document.getElementById('weather-info');
        if (el) el.textContent = '天気情報を取得できませんでした';
    }
}

function showWeatherAdvisory() {
    const el = document.getElementById('weather-advisory');
    if (!el) return;

    if (!weatherNow) {
        el.textContent = '';
        return;
    }

    const { temp, rain } = weatherNow;

    if (rain >= 60) {
        el.textContent = `☂️ 降水確率が高めです（${rain}%）。短めのルートをおすすめします。`;
        el.className = 'weather-advisory weather-advisory--rain';
    } else if (rain >= 30) {
        el.textContent = `🌂 にわか雨の可能性があります（${rain}%）。折りたたみ傘を持っていくと安心です。`;
        el.className = 'weather-advisory weather-advisory--caution';
    } else if (temp >= 35) {
        el.textContent = `🌡️ 気温が高くなっています（${temp}°C）。熱中症に注意し、水分補給をこまめに。`;
        el.className = 'weather-advisory weather-advisory--heat';
    } else if (temp >= 30) {
        el.textContent = `☀️ 暑い日です（${temp}°C）。こまめな水分補給を忘れずに。`;
        el.className = 'weather-advisory weather-advisory--caution';
    } else {
        el.textContent = '';
        el.className = 'weather-advisory';
    }
}

async function loadFacilities() {
    try {
        const [resFacilities, resCoins] = await Promise.all([
            fetch('/api/facilities'),
            fetch('/api/coins')
        ]);

        if (!resFacilities.ok) {
            throw new Error('facilities API error');
        }
        if (!resCoins.ok) {
            throw new Error('coins API error');
        }

        facilities = await resFacilities.json();
        coins = await resCoins.json();
        updateMarkers();
    } catch (error) {
        console.error('データの取得に失敗しました', error);
        updateRouteMessage('データの取得に失敗しました。時間をおいて再度お試しください。', true);
    }
}

function updateMarkers() {
    if (!map) {
        return;
    }
    // 古いマーカー削除
    markers.forEach(m => m.remove());
    markers = [];

    const showToilet = isChecked('toilet');
    const showNursing = isChecked('nursing');
    const showSaicoin = isChecked('saicoin');
    const showTamapon = isChecked('tamapon');

    facilities.forEach(facility => {
        if (
            (facility.toilet && showToilet) ||
            (facility.nursing && showNursing)
        ) {
            const el = document.createElement('div');
            el.style.width = '30px';
            el.style.height = '30px';
            el.style.backgroundSize = 'cover';

            if (facility.toilet && facility.nursing) {
                el.style.display = 'flex';
                el.innerHTML = `
            <img src="./icon/toilet.png" style="width:15px;height:15px;">
            <img src="./icon/nursing.png" style="width:15px;height:15px;">
            `;
            } else if (facility.toilet) {
                el.style.backgroundImage = 'url(./icon/toilet.png)';
            } else if (facility.nursing) {
                el.style.backgroundImage = 'url(./icon/nursing.png)';
            }

            const popupContent = `
                <strong>${facility.name}</strong><br>
                Address: ${facility.address}<br>
                Postcode: ${facility.postcode}<br>
                Phone: ${facility.phone_number}<br>
                Opening Hours: ${facility.opening_hours}<br>
                Regular Holidays: ${facility.regular_holidays}<br>
                Website: <a href="${facility.website}" target="_blank">${facility.website}</a>
                `;
            
            const marker = new mapboxgl.Marker(el)
                .setLngLat([facility.lng, facility.lat])
                .setPopup(new mapboxgl.Popup().setHTML(popupContent))
                .addTo(map);

            markers.push(marker);
        }
    });

    // coin施設のマーカー追加
    coins.forEach(coin => {
        if (
            showSaicoin && coin.cointype.includes('さいコイン') ||
            (showTamapon && coin.cointype.includes('たまポン'))
        ) {
            const el = document.createElement('div');
            el.style.width = '30px';
            el.style.height = '30px';
            el.style.backgroundSize = 'cover';

            if (coin.cointype.includes('さいコイン') && coin.cointype.includes('たまポン')) {
                // 両方持つ施設ならアイコンを横に並べる
                el.style.display = "flex";
                el.innerHTML = `
            <img src="./icon/coin_green.png" style="width:15px;height:15px;">
            <img src="./icon/pint_green.png" style="width:15px;height:15px;">
            `;
            } else if (coin.cointype.includes('さいコイン')) {
                el.style.backgroundImage = 'url(./icon/coin_green.png)';
            } else if (coin.cointype.includes('たまポン')) {
                el.style.backgroundImage = 'url(./icon/pint_green.png)';
            }

            const popupContent = `
                <strong>${coin.name}</strong><br>
                category: ${coin.category}<br>
                Address: ${coin.address}<br>
                Postcode: ${coin.postcode}<br>
                Phone: ${coin.phone_number}<br>
                `;

            const marker = new mapboxgl.Marker(el)
                .setLngLat([coin.lng, coin.lat])
                .setPopup(new mapboxgl.Popup().setHTML(popupContent))
                .addTo(map);

            markers.push(marker);
        }
    });
}

function isChecked(id) {
    const element = document.getElementById(id);
    return Boolean(element && element.checked);
}

async function handleFormSubmit(event) {
    event.preventDefault();

    if (!mapLoaded) {
        updateRouteMessage('地図を準備しています。少し待ってから再度お試しください。', true);
        return;
    }

    const formData = new FormData(event.target);
    const selectedFeels = formData.getAll('feel');

    const walkingTimeMinutes = Number(formData.get('walkTime')) || 0;
    if (!Number.isFinite(walkingTimeMinutes) || walkingTimeMinutes <= 0) {
        updateRouteMessage('Walking time を選択してください。', true);
        return;
    }

    const totalMeters = walkingTimeMinutes * WALKING_SPEED_METERS_PER_MIN;
    showWeatherAdvisory();
    updateRouteMessage('ルートを計算しています…');

    let routePlan;
    let spots = [];

    if (selectedFeels.length === 0) {
        // Feel 未選択: 目的地なし、Walking Time に合わせたランダムループを生成
        try {
            routePlan = await fetchNoDestinationRoute(START_COORDINATES, totalMeters);
        } catch (error) {
            console.error('ルート取得エラー:', error);
            updateRouteMessage('ルートの取得に失敗しました。時間をおいて再度お試しください。', true);
            return;
        }
    } else {
        // Feel 選択あり: DBからFeel別にランダムなスポットを取得して目的地にする
        try {
            spots = await fetchSpotsForFeels(selectedFeels, totalMeters);
        } catch (error) {
            console.error('スポット取得エラー:', error);
            updateRouteMessage('スポット情報の取得に失敗しました。時間をおいて再度お試しください。', true);
            return;
        }

        if (!spots.length) {
            updateRouteMessage('選択した Feel に該当するスポットが見つかりませんでした。歩行時間を増やすか、別の Feel をお試しください。', true);
            clearFeelMarkers();
            clearRouteLine();
            drawStartMarker(START_COORDINATES);
            return;
        }

        try {
            routePlan = await fetchRoadRoute(START_COORDINATES, spots);
        } catch (error) {
            console.error('ルート取得エラー:', error);
            updateRouteMessage('ルートの取得に失敗しました。時間をおいて再度お試しください。', true);
            return;
        }
    }

    if (!routePlan) {
        updateRouteMessage('条件に合うルートを描画できませんでした。別の条件をお試しください。', true);
        clearFeelMarkers();
        clearRouteLine();
        drawStartMarker(START_COORDINATES);
        return;
    }

    if (spots.length) {
        updateFeelMarkers(spots);
    } else {
        clearFeelMarkers();
    }
    drawStartMarker(START_COORDINATES);
    updateRouteLine(routePlan);
    adjustCamera(routePlan.coordinates, spots);

    if (selectedFeels.length && spots.length) {
        const feelSummary = new Intl.ListFormat('ja', { style: 'short', type: 'conjunction' })
            .format([...new Set(spots.flatMap(spot => spot.feel.filter(f => selectedFeels.includes(f))))]);
        const spotSummary = new Intl.ListFormat('ja', { style: 'short', type: 'conjunction' })
            .format(spots.map(spot => spot.name));
        updateRouteMessage(`${feelSummary} の気分に合わせて約 ${walkingTimeMinutes} 分で ${spotSummary} を巡るお散歩ルートを描画しました。`);
    } else {
        updateRouteMessage(`約 ${walkingTimeMinutes} 分のお散歩ルートを描画しました。`);
    }
}

function clearFeelMarkers() {
    feelMarkers.forEach(marker => marker.remove());
    feelMarkers = [];
}

function updateFeelMarkers(spots) {
    if (!map) {
        return;
    }
    clearFeelMarkers();

    spots.forEach(spot => {
        const marker = new mapboxgl.Marker({ color: '#2d8cf0' })
            .setLngLat([spot.lng, spot.lat])
            .setPopup(new mapboxgl.Popup({ offset: 12 }).setHTML(`
                <strong>${spot.name}</strong><br>
                ${spot.description}
            `))
            .addTo(map);
        feelMarkers.push(marker);
    });
}

function drawStartMarker(position) {
    if (!map) {
        return;
    }
    if (startMarker) {
        startMarker.remove();
    }
    startMarker = new mapboxgl.Marker({ color: '#ff6b6b' })
        .setLngLat([position.lng, position.lat])
        .setPopup(new mapboxgl.Popup({ offset: 12 }).setHTML('<strong>スタート & ゴール</strong>'))
        .addTo(map);
}

// Feel ごとに DBからランダムな1スポットを取得する
// radius = totalMeters / 2（片道分の歩行距離）でバウンディングボックス絞り込み
async function fetchSpotsForFeels(selectedFeels, totalMeters) {
    const radius = Math.round(totalMeters / 2);
    const params = [
        ...selectedFeels.map(f => `feel=${encodeURIComponent(f)}`),
        `lat=${START_COORDINATES.lat}`,
        `lng=${START_COORDINATES.lng}`,
        `radius=${radius}`
    ].join('&');
    const response = await fetch(`/api/feel-spots/random?${params}`);
    if (!response.ok) {
        throw new Error(`feel-spots API error: ${response.status}`);
    }
    return response.json();
}

async function fetchRoadRoute(start, spots) {
    const outboundWaypoints = [start, ...spots];

    // 復路は「最終スポット → 迂回点 → スタート」とすることで往路と別の道を通る
    const lastSpot = spots[spots.length - 1];
    const detour = computeDetourWaypoint(start, lastSpot);
    const returnWaypoints = detour
        ? [lastSpot, detour, start]
        : [...spots].reverse().concat([start]);

    const [outboundCoords, returnCoords] = await Promise.all([
        fetchWalkingDirections(outboundWaypoints),
        fetchWalkingDirections(returnWaypoints)
    ]);

    if (!outboundCoords || !returnCoords) {
        return null;
    }

    return {
        coordinates: [...outboundCoords, ...returnCoords],
        outboundCoordinates: outboundCoords,
        returnCoordinates: returnCoords,
        spots
    };
}

// Feel 未選択時: 目的地なしで Walking Time に合わせたループルートを生成する
async function fetchNoDestinationRoute(start, totalMeters) {
    const destination = computeRandomDestination(start, totalMeters);
    const detour = computeDetourWaypoint(start, destination);
    const returnWaypoints = detour ? [destination, detour, start] : [destination, start];

    const [outboundCoords, returnCoords] = await Promise.all([
        fetchWalkingDirections([start, destination]),
        fetchWalkingDirections(returnWaypoints)
    ]);

    if (!outboundCoords || !returnCoords) {
        return null;
    }

    return {
        coordinates: [...outboundCoords, ...returnCoords],
        outboundCoordinates: outboundCoords,
        returnCoordinates: returnCoords,
        spots: []
    };
}

// Walking Time から片道の折り返し点をランダムな方向に計算する
// 道路距離 ≈ 直線距離 × 1.3 を考慮して片道直線距離を算出する
function computeRandomDestination(start, totalMeters) {
    const straightLineMeters = totalMeters / (2 * 1.3);
    const angle = Math.random() * 2 * Math.PI;
    const metersPerDegLat = 111111;
    const metersPerDegLng = 111111 * Math.cos(start.lat * Math.PI / 180);
    return {
        lng: start.lng + (straightLineMeters * Math.sin(angle)) / metersPerDegLng,
        lat: start.lat + (straightLineMeters * Math.cos(angle)) / metersPerDegLat
    };
}

// 往路と復路が別の道を通るよう、スタート〜最終スポット間の中間点を
// 進行方向に対して垂直にずらした迂回ウェイポイントを計算する
function computeDetourWaypoint(start, lastSpot) {
    const midLng = (start.lng + lastSpot.lng) / 2;
    const midLat = (start.lat + lastSpot.lat) / 2;

    const dlng = lastSpot.lng - start.lng;
    const dlat = lastSpot.lat - start.lat;
    const len = Math.sqrt(dlng * dlng + dlat * dlat);
    if (len < 1e-10) return null;

    // ランダムに左右どちらかへ迂回して毎回違う街を歩けるようにする
    const sign = Math.random() < 0.5 ? 1 : -1;
    const perpLng = sign * (-dlat / len);
    const perpLat = sign * (dlng / len);

    const distMeters = haversineDistanceMeters(start, lastSpot);
    // 直線距離の40%ずらす（最低200m確保）
    const offsetMeters = Math.max(200, distMeters * 0.4);

    const metersPerDegLat = 111111;
    const metersPerDegLng = 111111 * Math.cos(midLat * Math.PI / 180);

    return {
        lng: midLng + perpLng * (offsetMeters / metersPerDegLng),
        lat: midLat + perpLat * (offsetMeters / metersPerDegLat)
    };
}

async function fetchWalkingDirections(waypoints) {
    const coords = waypoints.map(p => `${p.lng},${p.lat}`).join(';');
    const url = `https://api.mapbox.com/directions/v5/mapbox/walking/${coords}?geometries=geojson&overview=full&access_token=${mapboxgl.accessToken}`;
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Directions API error: ${response.status}`);
    }
    const data = await response.json();
    if (!data.routes || !data.routes.length) {
        return null;
    }
    return data.routes[0].geometry.coordinates;
}

function haversineDistanceMeters(pointA, pointB) {
    if (!pointA || !pointB) {
        return 0;
    }
    const R = 6371000;
    const lat1 = toRadians(pointA.lat);
    const lat2 = toRadians(pointB.lat);
    const deltaLat = toRadians(pointB.lat - pointA.lat);
    const deltaLng = toRadians(pointB.lng - pointA.lng);

    const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
        Math.cos(lat1) * Math.cos(lat2) *
        Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function toRadians(degrees) {
    return degrees * Math.PI / 180;
}

function shuffleArray(items) {
    const array = [...items];
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function updateRouteLine(routePlan) {
    if (!mapLoaded) {
        return;
    }
    const source = map.getSource('walk-route');
    if (source) {
        source.setData({
            type: 'FeatureCollection',
            features: [
                {
                    type: 'Feature',
                    geometry: { type: 'LineString', coordinates: routePlan.outboundCoordinates },
                    properties: { direction: 'outbound' }
                },
                {
                    type: 'Feature',
                    geometry: { type: 'LineString', coordinates: routePlan.returnCoordinates },
                    properties: { direction: 'return' }
                }
            ]
        });
    }
}

function clearRouteLine() {
    if (!mapLoaded) {
        return;
    }
    const source = map.getSource('walk-route');
    if (source) {
        source.setData(EMPTY_ROUTE);
    }
}

function adjustCamera(routeCoordinates, spots) {
    if (!mapLoaded || !routeCoordinates.length) {
        return;
    }
    const allPoints = [...routeCoordinates, ...spots.map(spot => [spot.lng, spot.lat])];
    const validPoints = allPoints.filter(point =>
        Array.isArray(point) && point.length === 2 &&
        Number.isFinite(point[0]) && Number.isFinite(point[1])
    );
    if (!validPoints.length) {
        return;
    }
    const bounds = validPoints.reduce((acc, coord) => {
        if (!acc) {
            return new mapboxgl.LngLatBounds(coord, coord);
        }
        return acc.extend(coord);
    }, null);

    if (bounds) {
        map.fitBounds(bounds, { padding: 48, maxZoom: 16, duration: 1000 });
    }
}

// チェックボックスとフォームにイベント追加
document.addEventListener('DOMContentLoaded', () => {
    routeMessageElement = document.getElementById('route-message');

    map = new mapboxgl.Map({
        container: 'map',
        style: 'mapbox://styles/mapbox/streets-v11',
        center: [139.6557, 35.8586], //浦和駅
        zoom: 15
    });

    map.on('load', () => {
        mapLoaded = true;
        try {
            map.addControl(new MapboxLanguage({ defaultLanguage: 'ja' }));
        } catch (error) {
            console.warn('MapboxLanguage の読み込みに失敗しました。', error);
        }
        map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
        map.addSource('walk-route', {
            type: 'geojson',
            data: EMPTY_ROUTE
        });
        map.addLayer({
            id: 'walk-route-line',
            type: 'line',
            source: 'walk-route',
            layout: {
                'line-cap': 'round',
                'line-join': 'round'
            },
            paint: {
                'line-color': '#1a73e8',
                'line-width': 4,
                'line-opacity': 0.85
            }
        });
        drawStartMarker(START_COORDINATES);
        map.resize();

    });

    window.addEventListener('resize', () => {
        if (mapLoaded) {
            map.resize();
        }
    });

    updateRouteMessage('条件を選んで「送信」を押すと、お散歩ルートが地図に表示されます。');

    const checkboxIds = ['toilet', 'nursing', 'saicoin', 'tamapon'];
    checkboxIds.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', updateMarkers);
        }
    });

    const form = document.querySelector('form');
    if (form) {
        form.addEventListener('submit', handleFormSubmit);
    }

    loadFacilities();
    loadWeather();
});
