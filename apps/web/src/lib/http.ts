import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

type Handler<C> = (request: NextRequest, context: C) => Promise<Response>;

// Wraps a route handler so thrown HttpErrors / zod errors / missing rows become JSON errors
// instead of 500 HTML pages (the mobile app and hub only understand JSON).
export function route<C>(handler: Handler<C>): Handler<C> {
  return async (request, context) => {
    try {
      return await handler(request, context);
    } catch (err) {
      if (err instanceof HttpError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      if (err instanceof z.ZodError) {
        const issue = err.issues[0];
        const where = issue?.path.length ? `${issue.path.join(".")}: ` : "";
        return NextResponse.json({ error: `${where}${issue?.message ?? "invalid input"}` }, { status: 400 });
      }
      if (typeof err === "object" && err && "code" in err && err.code === "P2025") {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      console.error("[api]", request.method, request.nextUrl.pathname, err);
      return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
    }
  };
}

export async function readJson<T extends z.ZodType>(request: NextRequest, schema: T): Promise<z.infer<T>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  return schema.parse(body);
}
