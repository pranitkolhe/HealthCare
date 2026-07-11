#!/usr/bin/env node
const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  try {
    await prisma.$connect();
    console.log('Connected to DB');
    const count = await prisma.user.count();
    console.log('User count:', count);
  } catch (err) {
    console.error('Prisma test failed:', err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
