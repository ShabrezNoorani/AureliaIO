import { supabase } from './supabase';

export interface BlogInput {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  category: string;
  read_time: number;
  published: boolean;
  published_at?: Date | string | null;
}

export interface Blog extends BlogInput {
  id: string;
  created_at: string;
  updated_at: string;
}

export async function fetchPublishedBlogs() {
  const { data, error } = await supabase
    .from('blogs')
    .select('*')
    .eq('published', true)
    .order('published_at', { ascending: false });
    
  if (error) throw error;
  return data as Blog[];
}

export async function fetchBlogBySlug(slug: string) {
  const { data, error } = await supabase
    .from('blogs')
    .select('*')
    .eq('slug', slug)
    .eq('published', true)
    .single();
    
  if (error) throw error;
  return data as Blog;
}

export async function fetchAllBlogs() {
  const { data, error } = await supabase
    .from('blogs')
    .select('*')
    .order('created_at', { ascending: false });
    
  if (error) throw error;
  return data as Blog[];
}

export async function createBlog(blog: BlogInput) {
  const { data, error } = await supabase
    .from('blogs')
    .insert(blog)
    .select()
    .single();
    
  if (error) throw error;
  return data as Blog;
}

export async function updateBlog(id: string, blog: Partial<BlogInput>) {
  const { data, error } = await supabase
    .from('blogs')
    .update({ ...blog, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
    
  if (error) throw error;
  return data as Blog;
}

export async function deleteBlog(id: string) {
  const { error } = await supabase
    .from('blogs')
    .delete()
    .eq('id', id);
    
  if (error) throw error;
}

export async function publishBlog(id: string) {
  const { data, error } = await supabase
    .from('blogs')
    .update({ 
      published: true, 
      published_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .select()
    .single();
    
  if (error) throw error;
  return data as Blog;
}
