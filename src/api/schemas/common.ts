import { z } from "zod";
import type { Context } from "hono";

/** RFC 9457 Problem Detail schema */
export const ProblemDetailSchema = z.object({
  type: z.string().default("about:blank"),
  title: z.string(),
  status: z.number(),
  detail: z.string().optional(),
  instance: z.string().optional(),
});

export type ProblemDetail = z.infer<typeof ProblemDetailSchema>;

/** Create a Problem Detail JSON object */
export function createProblem(
  status: number,
  title: string,
  detail?: string,
  instance?: string
): ProblemDetail {
  return {
    type: "about:blank",
    title,
    status,
    ...(detail ? { detail } : {}),
    ...(instance ? { instance } : {}),
  };
}

/** Create a Problem Detail Response with proper content-type */
export function createProblemResponse(
  c: Context,
  status: number,
  title: string,
  detail?: string,
  headers?: Record<string, string>
): Response {
  const body = createProblem(status, title, detail, c.req.path);
  return c.json(body, status as 400, {
    "Content-Type": "application/problem+json",
    ...(headers ?? {}),
  });
}
