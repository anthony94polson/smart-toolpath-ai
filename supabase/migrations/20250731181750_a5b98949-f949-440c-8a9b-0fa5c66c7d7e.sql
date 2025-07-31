-- Make the models storage bucket public so ONNX models can be accessed via public URLs
UPDATE storage.buckets 
SET public = true 
WHERE id = 'models';

-- Ensure proper policies exist for public access
INSERT INTO storage.policies (id, bucket_id, name, definition, check_expression, command, roles)
VALUES (
  'allow_public_model_access',
  'models',
  'Allow public access to models',
  'bucket_id = ''models''',
  'bucket_id = ''models''',
  'SELECT',
  '{public}'
) ON CONFLICT (id) DO NOTHING;