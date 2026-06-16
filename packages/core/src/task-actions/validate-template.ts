import { knownPromptPlaceholders } from "./types.js";

const placeholderPattern = /\{\{(\w+)\}\}/g;

export function findTemplatePlaceholders(template: string): readonly string[] {
  const matches = template.matchAll(placeholderPattern);
  return [...new Set([...matches].map((match) => match[1] ?? ""))].filter(
    (name) => name.length > 0
  );
}

export function findUnknownPlaceholders(template: string): readonly string[] {
  const known = new Set<string>(knownPromptPlaceholders);
  return findTemplatePlaceholders(template).filter((name) => !known.has(name));
}

export class UnknownPromptPlaceholderError extends Error {
  public constructor(public readonly placeholder: string) {
    super(`Unknown prompt placeholder: ${placeholder}`);
    this.name = "UnknownPromptPlaceholderError";
  }
}
