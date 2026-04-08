import { Prisma } from "@prisma/client";

function getUniqueConstraintTargets(error: unknown): string[] {
  if (
    !(error instanceof Prisma.PrismaClientKnownRequestError) ||
    error.code !== "P2002"
  ) {
    return [];
  }

  const target = (error.meta as { target?: unknown } | undefined)?.target;
  if (Array.isArray(target)) {
    return target.map((value) => String(value));
  }

  if (typeof target === "string") {
    return [target];
  }

  return [];
}

export function isPrismaUniqueConstraintError(
  error: unknown,
  field?: string,
): boolean {
  const targets = getUniqueConstraintTargets(error);
  if (!field) {
    return targets.length > 0;
  }

  return targets.some(
    (target) =>
      target === field ||
      target.includes(field) ||
      target.endsWith(`_${field}_key`),
  );
}
