export default async function globalTeardown() {
  // Prisma clients disconnect in each test file's afterAll
  console.log('\nTest suite complete.\n');
}
