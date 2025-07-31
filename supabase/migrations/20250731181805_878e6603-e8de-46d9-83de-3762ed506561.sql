-- Make the models storage bucket public
UPDATE storage.buckets 
SET public = true 
WHERE id = 'models';