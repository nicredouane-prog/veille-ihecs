export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  const key=process.env.VAPID_PUBLIC_KEY||'';
  res.status(200).json({configured:Boolean(key&&process.env.SUPABASE_URL&&process.env.SUPABASE_SERVICE_ROLE_KEY),publicKey:key||null});
}
