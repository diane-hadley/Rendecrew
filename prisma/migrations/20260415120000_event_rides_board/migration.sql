-- Add rides board schema (Event rides board spec 0004).
-- Note: This migration exists because the database already has these tables; it was missing locally.

-- CreateEnum
CREATE TYPE "RideCarDirection" AS ENUM ('BOTH', 'TO_EVENT', 'FROM_EVENT');

-- CreateEnum
CREATE TYPE "RideCustomFieldType" AS ENUM ('TEXT', 'NUMBER', 'BOOLEAN');

-- CreateEnum
CREATE TYPE "RidePassengerLeg" AS ENUM ('UNIFIED', 'TO_EVENT', 'FROM_EVENT');

-- CreateEnum
CREATE TYPE "RidesMode" AS ENUM ('RIDES_UNIFIED', 'RIDES_SPLIT');

-- AlterTable
ALTER TABLE "events"
ADD COLUMN     "rides_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rides_mode" "RidesMode" NOT NULL DEFAULT 'RIDES_UNIFIED',
ADD COLUMN     "rides_hidden_built_in_field_keys" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "event_ride_cars" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "driver_event_member_id" TEXT NOT NULL,
    "passenger_capacity" INTEGER NOT NULL,
    "direction" "RideCarDirection" NOT NULL DEFAULT 'BOTH',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "make_model" TEXT,
    "fun_name" TEXT,
    "notes" TEXT,
    "departure_location" TEXT,
    "departure_toward_event_at" TIMESTAMPTZ(3),
    "expected_arrival_at_event_at" TIMESTAMPTZ(3),
    "departure_from_event_at" TIMESTAMPTZ(3),
    "expected_arrival_home_at" TIMESTAMPTZ(3),
    "returning_to" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_ride_cars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_ride_custom_field_definitions" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "RideCustomFieldType" NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_ride_custom_field_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_ride_custom_field_values" (
    "id" TEXT NOT NULL,
    "field_definition_id" TEXT NOT NULL,
    "car_id" TEXT NOT NULL,
    "text_value" TEXT,
    "number_value" DOUBLE PRECISION,
    "boolean_value" BOOLEAN,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_ride_custom_field_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_ride_passengers" (
    "id" TEXT NOT NULL,
    "car_id" TEXT NOT NULL,
    "event_member_id" TEXT NOT NULL,
    "leg" "RidePassengerLeg" NOT NULL,

    CONSTRAINT "event_ride_passengers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_ride_cars_event_id_idx" ON "event_ride_cars"("event_id");

-- CreateIndex
CREATE INDEX "event_ride_cars_event_id_direction_idx" ON "event_ride_cars"("event_id", "direction");

-- CreateIndex
CREATE INDEX "event_ride_cars_event_id_sort_order_idx" ON "event_ride_cars"("event_id", "sort_order");

-- CreateIndex
CREATE INDEX "event_ride_custom_field_definitions_event_id_idx" ON "event_ride_custom_field_definitions"("event_id");

-- CreateIndex
CREATE INDEX "event_ride_custom_field_values_car_id_idx" ON "event_ride_custom_field_values"("car_id");

-- CreateIndex
CREATE UNIQUE INDEX "event_ride_custom_field_values_field_definition_id_car_id_key" ON "event_ride_custom_field_values"("field_definition_id", "car_id");

-- CreateIndex
CREATE INDEX "event_ride_passengers_car_id_idx" ON "event_ride_passengers"("car_id");

-- CreateIndex
CREATE UNIQUE INDEX "event_ride_passengers_event_member_id_leg_key" ON "event_ride_passengers"("event_member_id", "leg");

-- AddForeignKey
ALTER TABLE "event_ride_cars" ADD CONSTRAINT "event_ride_cars_driver_event_member_id_fkey" FOREIGN KEY ("driver_event_member_id") REFERENCES "event_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_ride_cars" ADD CONSTRAINT "event_ride_cars_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_ride_custom_field_definitions" ADD CONSTRAINT "event_ride_custom_field_definitions_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_ride_custom_field_values" ADD CONSTRAINT "event_ride_custom_field_values_car_id_fkey" FOREIGN KEY ("car_id") REFERENCES "event_ride_cars"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_ride_custom_field_values" ADD CONSTRAINT "event_ride_custom_field_values_field_definition_id_fkey" FOREIGN KEY ("field_definition_id") REFERENCES "event_ride_custom_field_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_ride_passengers" ADD CONSTRAINT "event_ride_passengers_car_id_fkey" FOREIGN KEY ("car_id") REFERENCES "event_ride_cars"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_ride_passengers" ADD CONSTRAINT "event_ride_passengers_event_member_id_fkey" FOREIGN KEY ("event_member_id") REFERENCES "event_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

