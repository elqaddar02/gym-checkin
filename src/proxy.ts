import { getToken } from "next-auth/jwt";
import { NextResponse, type NextRequest } from "next/server";

// Optimistic redirect for owner pages; API routes and pages still verify the session themselves.
export async function proxy(request: NextRequest) {
  const token = await getToken({ req: request });
  if (token) return NextResponse.next();

  const login = new URL("/login", request.url);
  login.searchParams.set("callbackUrl", request.nextUrl.pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/members/:path*", "/dashboard/:path*"],
};
