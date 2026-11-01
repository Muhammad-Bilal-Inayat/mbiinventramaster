import argon2 from "argon2";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import type { PermissionCode, PlanId } from "./catalog.js";

const jwtSecret = process.env.JWT_SECRET || "local-development-only-change-me";

export interface AccessClaims extends jwt.JwtPayload {
  sub: string;
  tenantId: string;
  deviceId: string;
  plan: PlanId;
  branchIds: string[];
  permissions: PermissionCode[];
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

export function signAccessToken(claims: Omit<AccessClaims, "iat" | "exp">): string {
  return jwt.sign(claims, jwtSecret, { expiresIn: "8h", issuer: "mbi-inventra" });
}

export function verifyAccessToken(token: string): AccessClaims {
  return jwt.verify(token, jwtSecret, { issuer: "mbi-inventra" }) as AccessClaims;
}

export function randomId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(9).toString("base64url")}`;
}

export function deviceFingerprint(input: string): string {
  return crypto.createHash("sha256").update(`${input}:${jwtSecret}`).digest("hex");
}

export function deviceSignature(deviceId: string, nonce: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(`${deviceId}:${nonce}`).digest("hex");
}
