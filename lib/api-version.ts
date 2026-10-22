import { NextResponse } from "next/server";

export const API_V1_HEADERS = {
  "X-API-Version": "1",
  "Cache-Control": "no-store",
};

export const LEGACY_API_HEADERS = {
  "X-API-Version": "1",
  Deprecation: "true",
  Sunset: "2027-10-22",
  Link: '</api/v1>; rel="successor-version"',
};

export function withApiVersion(response: Response, version = "1") {
  response.headers.set("X-API-Version", version);
  return response;
}

export function withLegacyApiHeaders(response: Response) {
  for (const [key, value] of Object.entries(LEGACY_API_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}

export function apiVersionMetadata(version = "1") {
  return { apiVersion: version };
}

export function apiVersionOptions(version = "1") {
  return NextResponse.json(apiVersionMetadata(version), {
    headers: { "X-API-Version": version, Allow: "GET, POST, PUT, PATCH, DELETE, OPTIONS" },
  });
}
