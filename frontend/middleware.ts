import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/change-password"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isAuthenticated = !!request.cookies.get("access_token");
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  // Not authenticated → send to /login (unless already there)
  if (!isAuthenticated && !isPublic) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Authenticated and hits / or /dashboard → send to /students
  if (isAuthenticated && (pathname === "/" || pathname === "/dashboard")) {
    return NextResponse.redirect(new URL("/students", request.url));
  }

  // Authenticated and hits /login → send to /students
  if (isAuthenticated && pathname.startsWith("/login")) {
    return NextResponse.redirect(new URL("/students", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon\\.ico|.*\\.png|.*\\.jpg|.*\\.jpeg|.*\\.svg|.*\\.webp|.*\\.ico).*)",
  ],
};
