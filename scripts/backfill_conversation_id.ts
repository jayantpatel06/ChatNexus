
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    console.log("Starting backfill of conversationId...");

    const messages = await prisma.message.findMany({
        where: {
            conversationId: null,
        },
    });

    console.log(`Found ${messages.length} messages to update.`);

    let updatedCount = 0;
    for (const msg of messages) {
        const minId = Math.min(msg.senderId, msg.receiverId);
        const maxId = Math.max(msg.senderId, msg.receiverId);
        const conversationId = `${minId}:${maxId}`;

        await prisma.message.update({
            where: { msgId: msg.msgId },
            data: { conversationId },
        });
        updatedCount++;
        if (updatedCount % 100 === 0) {
            console.log(`Updated ${updatedCount} messages...`);
        }
    }

    console.log(`Backfill complete. Updated ${updatedCount} messages.`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
