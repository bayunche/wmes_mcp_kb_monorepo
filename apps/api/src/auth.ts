export function requireAuth(request: Request, expectedToken: string): void {
  const header = request.headers.get("authorization");
  if (!header || !header.startsWith("Bearer ")) {
    throw new Error("Unauthorized");
  }
  const token = header.slice("Bearer ".length).trim();
  if (token !== expectedToken) {
    throw new Error("Unauthorized");
  }
}
