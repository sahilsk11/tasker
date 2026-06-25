export function readValue(argv, index, flag) {
  const value = argv[index];
  if (value == null || value.startsWith("-")) {
    throw new Error(`Missing value for ${flag}`);
  }

  return value;
}
