import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';

const adapter = new PrismaLibSql({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN,
});
const prisma = new PrismaClient({ adapter });

async function main() {
    // Supprimer les données existantes
    await prisma.trip.deleteMany();
    await prisma.vehicle.deleteMany();

    // Véhicules réels — Croix-Rouge Unité Locale Paris 18
    const vehicles = [
        {
            name: 'VL186',
            type: 'VL',
            plate: 'XX-186-XX',
            status: 'AVAILABLE',
            parkingSpot: 'Place A1',
            fuelLevel: 80,
            mileage: 42000,
            hasDSA: false,
            notes: 'Véhicule léger',
        },
        {
            name: 'VL188',
            type: 'VL',
            plate: 'XX-188-XX',
            status: 'AVAILABLE',
            parkingSpot: 'Place A2',
            fuelLevel: 65,
            mileage: 38500,
            hasDSA: false,
            notes: 'Véhicule léger',
        },
        {
            name: 'VL486',
            type: 'VL',
            plate: 'XX-486-XX',
            status: 'AVAILABLE',
            parkingSpot: 'Place A3',
            fuelLevel: 90,
            mileage: 15200,
            hasDSA: false,
            notes: 'Véhicule léger',
        },
        {
            name: 'VPSP182',
            type: 'VPSP',
            plate: 'XX-182-XX',
            status: 'AVAILABLE',
            parkingSpot: 'Place B1',
            fuelLevel: 75,
            mileage: 28700,
            hasDSA: true,
            notes: 'Véhicule de premiers secours — équipé DSA',
        },
    ];

    for (const vehicle of vehicles) {
        await prisma.vehicle.create({ data: vehicle });
    }

    console.log('✅ Base de données Turso alimentée avec 4 véhicules (VL186, VL188, VL486, VPSP182)');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
