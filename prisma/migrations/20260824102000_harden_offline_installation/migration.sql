ALTER TABLE "SystemInstallation"
  ADD CONSTRAINT "SystemInstallation_singleton_check" CHECK ("id" = 'singleton');
