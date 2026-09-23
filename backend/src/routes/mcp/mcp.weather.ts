import {
    FORECAST_URL,
    GEOCODE_URL,
    SEARCH_TIMEOUT,
    WEATHER_CODES,
    WEATHER_DAYS_MAX,
} from '../../constant.js';

export interface WeatherOutcome {
    ok: boolean;
    reason?: string;
    report?: Record<string, unknown>;
}

async function json(url: string): Promise<unknown> {
    const response = await fetch(url, { signal: AbortSignal.timeout(SEARCH_TIMEOUT) });

    if (!response.ok) {
        throw new Error(`http ${response.status}`);
    }

    return response.json();
}

export function describe(code: unknown): string {
    return typeof code === 'number' ? (WEATHER_CODES[code] ?? `code ${code}`) : 'unknown';
}

export async function weatherFor(place: string, days: number): Promise<WeatherOutcome> {
    const span = Math.min(WEATHER_DAYS_MAX, Math.max(1, Math.round(days)));

    try {
        const found = (await json(
            `${GEOCODE_URL}?${new URLSearchParams({ name: place, count: '1', language: 'en', format: 'json' })}`,
        )) as {
            results?: {
                name: string;
                country?: string;
                admin1?: string;
                latitude: number;
                longitude: number;
                timezone?: string;
            }[];
        };
        const spot = found.results?.[0];

        if (!spot) {
            return { ok: false, reason: `no place called ${place} was found` };
        }

        const forecast = (await json(
            `${FORECAST_URL}?${new URLSearchParams({
                latitude: String(spot.latitude),
                longitude: String(spot.longitude),
                current:
                    'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m',
                daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum',
                timezone: 'auto',
                forecast_days: String(span),
            })}`,
        )) as {
            timezone?: string;
            current?: Record<string, unknown>;
            daily?: Record<string, unknown[]>;
        };

        const current = forecast.current ?? {};
        const daily = forecast.daily ?? {};
        const dates = (daily['time'] ?? []) as string[];

        return {
            ok: true,
            report: {
                place: [spot.name, spot.admin1, spot.country].filter(Boolean).join(', '),
                timezone: forecast.timezone ?? spot.timezone,
                now: {
                    time: current['time'],
                    conditions: describe(current['weather_code']),
                    temperature_c: current['temperature_2m'],
                    feels_like_c: current['apparent_temperature'],
                    humidity_percent: current['relative_humidity_2m'],
                    precipitation_mm: current['precipitation'],
                    wind_kmh: current['wind_speed_10m'],
                },
                days: dates.map((date, index) => ({
                    date,
                    conditions: describe(daily['weather_code']?.[index]),
                    high_c: daily['temperature_2m_max']?.[index],
                    low_c: daily['temperature_2m_min']?.[index],
                    rain_chance_percent: daily['precipitation_probability_max']?.[index],
                    precipitation_mm: daily['precipitation_sum']?.[index],
                })),
                source: 'open-meteo.com',
            },
        };
    } catch {
        return { ok: false, reason: 'the weather service did not answer' };
    }
}
