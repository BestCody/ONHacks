const db = globalThis.__B44_DB__ || { auth:{ isAuthenticated: async()=>false, me: async()=>null }, entities:new Proxy({}, { get:()=>({ filter:async()=>[], get:async()=>null, create:async()=>({}), update:async()=>({}), delete:async()=>({}) }) }), integrations:{ Core:{ UploadFile:async()=>({ file_url:'' }) } } };

import React from "react";

export default function AuthLayout({ icon: Icon, title, subtitle, footer, children }) {
  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-10 bg-[#F0F8FF]"
      style={{
        backgroundImage: "url(https://media.db.com/images/public/6a8ffb9d68dbb363d52553fb/0a2afae49_pixel-background-abstract-blue-texture-with-pixelated-design-and-an-aspect-ratio-of-43-vector-image-2FKP6K4.jpg)",
        backgroundRepeat: 'no-repeat',
        backgroundSize: 'cover',
        backgroundPosition: 'center'
      }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          

          
          <h1 className="text-3xl font-bold tracking-tight text-[hsl(var(--foreground))]">{title}</h1>
          {subtitle && <p className="mt-2 text-[hsl(var(--foreground))]">{subtitle}</p>}
        </div>
        <div className="bg-white rounded-2xl shadow-xl border border-blue-200 p-8">
          {children}
        </div>
        {footer &&
        <p className="text-center text-sm mt-6 text-[hsl(var(--foreground))]">{footer}</p>
        }
      </div>
    </div>);

}