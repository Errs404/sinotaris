ALTER TABLE "PekerjaanClient"
  ADD CONSTRAINT "PekerjaanClient_capacity_length_check" CHECK ("capacity" IS NULL OR char_length("capacity") <= 500);

ALTER TABLE "PekerjaanLandObject"
  ADD CONSTRAINT "PekerjaanLandObject_text_length_check" CHECK (
    ("label" IS NULL OR char_length("label") <= 120)
    AND ("hakType" IS NULL OR char_length("hakType") <= 100)
    AND ("certificateNumber" IS NULL OR char_length("certificateNumber") <= 100)
    AND ("nib" IS NULL OR char_length("nib") <= 100)
    AND ("nop" IS NULL OR char_length("nop") <= 100)
    AND ("address" IS NULL OR char_length("address") <= 1000)
  );
