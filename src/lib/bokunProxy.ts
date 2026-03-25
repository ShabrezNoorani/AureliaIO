export async function callBokunProxy(
  supabase: any,
  endpoint: string,
  method: string = 'GET',
  params?: Record<string, string>,
  body?: any
): Promise<any> {
  
  const { data: { user } } = 
    await supabase.auth.getUser()
  
  if (!user) throw new Error('Not logged in')
  
  const { data: profile, error: profileError } = 
    await supabase
      .from('profiles')
      .select('bokun_access_key, bokun_secret_key')
      .eq('id', user.id)
      .single()
  
  if (profileError) {
    console.error('Profile error:', profileError)
    throw new Error('Could not load settings')
  }
  
  if (!profile?.bokun_access_key?.trim() || 
      !profile?.bokun_secret_key?.trim()) {
    throw new Error(
      'Bokun keys not found in your profile. ' +
      'Please save them in Settings first.'
    )
  }
  
  const { data, error } = await supabase
    .functions.invoke('bokun-proxy', {
      body: {
        endpoint,
        method,
        params: params || {},
        body: body || null,
        accessKey: profile.bokun_access_key.trim(),
        secretKey: profile.bokun_secret_key.trim()
      }
    })
  
  if (error) {
    console.error('Edge function error:', error)
    throw new Error(
      'Bokun connection failed: ' + 
      (error.message || 'Unknown error')
    )
  }
  
  return data
}
