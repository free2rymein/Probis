export const errorFields = (error: unknown) => {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack
    };
  }

  return {
    message: "Unknown error",
    stack: undefined
  };
};
