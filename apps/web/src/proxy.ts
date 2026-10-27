import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

// Dashboard pages need a signed-in caregiver. API routes do their own auth (they also accept
// device tokens from the senior app and hub), so they're excluded here.
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const signedIn = !!verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  const isAuthPage = pathname === "/login" || pathname === "/signup";

  if (!signedIn && !isAuthPage) {
    const url = new URL("/login", request.url);
    if (pathname !== "/") url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }
  if (signedIn && isAuthPage) return NextResponse.redirect(new URL("/", request.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico)$).*)"],
};
