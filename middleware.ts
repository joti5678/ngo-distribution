import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1. Bypass static files and APIs
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  // 2. Read session from Cookie
  const sessionCookie = req.cookies.get('user_session')?.value;
  const isPublicPath = pathname === '/login' || pathname === '/';

  if (!sessionCookie) {
    if (!isPublicPath) {
        return NextResponse.redirect(new URL('/login', req.url));
    }
    return NextResponse.next();
  }

  let user;
  try {
    user = JSON.parse(decodeURIComponent(sessionCookie));
  } catch (err) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  if (isPublicPath) {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }

  // 3. SUPER ADMIN Bypass
  const roleName = (user.user_roles?.role_name || '').toUpperCase();
  const isSuperAdmin = roleName.includes('SUPER ADMIN') || roleName === 'ADMIN' || roleName.includes('WEB ADMIN');

  if (isSuperAdmin) {
      return NextResponse.next();
  }

  // 4. Common paths for all logged-in users
  if (pathname === '/dashboard' || pathname === '/profile') {
      return NextResponse.next();
  }

  // 5. PARALLEL OPTIMIZED SECURITY CHECK
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  try {
      const [menusRes, accessRes] = await Promise.all([
          fetch(`${supabaseUrl}/rest/v1/app_menus?is_active=eq.true&select=id,path,parent_id`, {
             headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` },
             cache: 'no-store'
          }),
          fetch(`${supabaseUrl}/rest/v1/role_route_access?role_id=eq.${user.role_id}&select=menu_id`, {
             headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` },
             cache: 'no-store'
          })
      ]);

      const allMenus = await menusRes.json();
      const access = await accessRes.json();

      // FIX: Sort menus by length descending to match the EXACT longest path first!
      const sortedMenus = [...allMenus].sort((a: any, b: any) => b.path.length - a.path.length);
      
      const currentMenu = sortedMenus.find((m: any) => pathname === m.path || pathname.startsWith(m.path + '/'));
      
      if (!currentMenu) {
          return NextResponse.redirect(new URL('/dashboard', req.url));
      }

      if (!access || access.length === 0) {
          return NextResponse.redirect(new URL('/dashboard', req.url));
      }

      const allowedIds = access.map((a: any) => a.menu_id);

      // WILDCARD AND EXACT CHECK LOGIC
      const isExactAccess = allowedIds.includes(currentMenu.id);
      const isParentAccess = currentMenu.parent_id && allowedIds.includes(currentMenu.parent_id);

      // Allow access if they have Exact Page Access OR Parent Wildcard Access
      if (isExactAccess || isParentAccess) {
          return NextResponse.next();
      } 
      
      return NextResponse.redirect(new URL('/dashboard', req.url));

  } catch (e) {
      console.error("Middleware Auth Error", e);
      return NextResponse.redirect(new URL('/dashboard', req.url));
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};