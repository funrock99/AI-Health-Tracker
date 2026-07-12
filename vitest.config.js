module.exports = {
  test: {
    include: ["tests/unit/**/*.test.js"],
    environment: "node",
    globals: true,
    restoreMocks: true
  }
};
