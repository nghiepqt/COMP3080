import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

function decodeJwt(token: string) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payloadBase64 = parts[1];
    // Convert base64url to base64
    const base64 = payloadBase64.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = atob(base64);
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
}

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const token = request.cookies.get('auth_token')?.value;

  // Handle /dashboard redirection
  if (path === '/dashboard') {
    if (!token) {
      return NextResponse.redirect(new URL('/', request.url));
    }

    const payload = decodeJwt(token);
    if (!payload || !payload.role) {
      return NextResponse.redirect(new URL('/', request.url));
    }

    const role = payload.role; // "museum" or "collector"

    if (role === 'museum') {
      return NextResponse.redirect(new URL('/museum', request.url));
    } else if (role === 'collector') {
      return NextResponse.redirect(new URL('/collector', request.url));
    } else {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  // Protect /museum route
  if (path === '/museum') {
    if (!token) {
      return NextResponse.redirect(new URL('/', request.url));
    }

    const payload = decodeJwt(token);
    if (!payload || payload.role !== 'museum') {
      // If the user is a collector, redirect them to /collector, else to homepage
      if (payload?.role === 'collector') {
        return NextResponse.redirect(new URL('/collector', request.url));
      }
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  // Protect /collector route
  if (path === '/collector') {
    if (!token) {
      return NextResponse.redirect(new URL('/', request.url));
    }

    const payload = decodeJwt(token);
    if (!payload || payload.role !== 'collector') {
      // If the user is a museum, redirect them to /museum, else to homepage
      if (payload?.role === 'museum') {
        return NextResponse.redirect(new URL('/museum', request.url));
      }
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard', '/museum', '/collector'],
};
