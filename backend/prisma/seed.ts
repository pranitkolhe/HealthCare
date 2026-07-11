import bcrypt from 'bcrypt';
import prisma from '../src/config/db';

async function main() {
  const adminPassword = 'Admin@1234';
//   const doctorPassword = 'Pranit@1234';

  const adminUser = await prisma.user.upsert({
    where: { email: 'pranitkolhe3@gmail.com' },
    update: { isActive: true, passwordHash: await bcrypt.hash(adminPassword, 12) },
    create: {
      email: 'pranitkolhe3@gmail.com',
      passwordHash: await bcrypt.hash(adminPassword, 12),
      role: 'ADMIN',
      isActive: true,
    },
  });

  console.log('Seed completed successfully.');
  console.log('Admin credentials: pranitkolhe3@gmail.com/ Admin@1234');
//   console.log('Doctor credentials: pranitkolhe4@gmail.com / Doctor@1234');
  return { adminUser };
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
