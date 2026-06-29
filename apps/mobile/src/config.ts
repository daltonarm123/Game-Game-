import { Platform } from "react-native";

function normalizeBaseUrl(raw: string | undefined): string | null {
	if (!raw) return null;
	const trimmed = raw.trim();
	if (!trimmed) return null;
	return trimmed.replace(/\/+$/, "");
}

// Priority:
// 1) EXPO_PUBLIC_API_BASE_URL from env
// 2) Android emulator loopback
// 3) Localhost for iOS simulator and Expo web
const envApiBase = normalizeBaseUrl(process.env.EXPO_PUBLIC_API_BASE_URL);

const defaultApiBase = Platform.select({
	android: "http://10.0.2.2:8080",
	default: "http://localhost:8080",
});

export const API_BASE = envApiBase || defaultApiBase;
