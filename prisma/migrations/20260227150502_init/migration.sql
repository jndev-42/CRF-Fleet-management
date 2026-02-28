-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "plate" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "parkingSpot" TEXT,
    "fuelLevel" INTEGER NOT NULL DEFAULT 100,
    "mileage" INTEGER NOT NULL DEFAULT 0,
    "hasDSA" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Trip" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "vehicleId" TEXT NOT NULL,
    "driverName" TEXT NOT NULL,
    "driverEmail" TEXT,
    "missionType" TEXT NOT NULL,
    "missionName" TEXT,
    "checkOutAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mileageOut" INTEGER NOT NULL,
    "fuelOut" INTEGER NOT NULL,
    "conditionOut" TEXT NOT NULL,
    "parkingOut" TEXT,
    "dsaChecked" BOOLEAN NOT NULL DEFAULT false,
    "commentsOut" TEXT,
    "checkInAt" DATETIME,
    "mileageIn" INTEGER,
    "fuelIn" INTEGER,
    "conditionIn" TEXT,
    "parkingIn" TEXT,
    "windowsClosed" BOOLEAN,
    "vehicleInspected" BOOLEAN,
    "incident" TEXT,
    "dsaUsed" BOOLEAN,
    "commentsIn" TEXT,
    "parkingPhoto" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Trip_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_plate_key" ON "Vehicle"("plate");

-- CreateIndex
CREATE INDEX "Trip_vehicleId_idx" ON "Trip"("vehicleId");
