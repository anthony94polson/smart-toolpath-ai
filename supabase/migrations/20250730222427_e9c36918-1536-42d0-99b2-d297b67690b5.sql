-- Create storage policies for model conversion
CREATE POLICY "Allow authenticated users to upload models" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'models' AND auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated users to read models" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'models' AND auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated users to update models" 
ON storage.objects 
FOR UPDATE 
USING (bucket_id = 'models' AND auth.role() = 'authenticated');