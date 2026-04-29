import { auth } from "@/lib/auth";

export async function GET(req: Request) {
  try {
    const session = await auth.api.getSession({
      headers: req.headers,
    });

    return Response.json({ user: session?.user || null });
  } catch (error) {
    console.error("Session error:", error);
    return Response.json({ user: null });
  }
}