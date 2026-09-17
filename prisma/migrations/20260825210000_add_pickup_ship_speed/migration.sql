-- Office pickup at clinic checkout: $0 shipping, no FedEx label.
-- Plain statements only — the admin migrate runner splits on `;`.

ALTER TYPE "ShipSpeed" ADD VALUE IF NOT EXISTS 'PICKUP';
