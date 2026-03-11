import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/server/auth/config";
import { generateOAuthState } from "../_lib/oauth-state";

export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session?.user?.organizationId) {
    return NextResponse.redirect(new URL("/login", process.env.NEXTAUTH_URL));
  }

  const state = await generateOAuthState(session.user.organizationId);

  const params = new URLSearchParams({
    client_id: process.env.INSTAGRAM_APP_ID ?? "",
    redirect_uri: `${process.env.NEXTAUTH_URL}/api/oauth/instagram/callback`,
    response_type: "code",
    scope: "instagram_basic,instagram_content_publish,pages_show_list",
    state,
  });

  return NextResponse.redirect(
    `https://www.facebook.com/v19.0/dialog/oauth?${params.toString()}`,
  );
}
