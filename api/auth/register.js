import { supabase } from '../../lib/supabase.js';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  console.log(`[auth/register] POST request`);

  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Validate password length
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Use Supabase Auth to sign up the user
    const { data, error } = await supabase.auth.signUp({
      email: email.toLowerCase(),
      password: password,
    });

    if (error) {
      // Handle specific Supabase errors
      if (error.message.includes('already registered') || error.message.includes('User already registered')) {
        return res.status(409).json({ error: 'User with this email already exists' });
      }
      return res.status(400).json({ error: error.message || 'Registration failed' });
    }

    if (!data.user) {
      return res.status(500).json({ error: 'Failed to create user' });
    }

    // Check if we have a session (email confirmation might be disabled)
    if (data.session) {
      // Return token and user info immediately
      return res.status(201).json({
        token: data.session.access_token,
        user: {
          id: data.user.id,
          email: data.user.email,
        },
      });
    }

    // If no session, try to sign in (email confirmation might be required)
    // Note: This will fail if email confirmation is required and not completed
    const { data: sessionData, error: sessionError } = await supabase.auth.signInWithPassword({
      email: email.toLowerCase(),
      password: password,
    });

    if (sessionError || !sessionData.session) {
      // If email confirmation is required, inform the user
      if (sessionError?.message?.includes('Email not confirmed')) {
        return res.status(400).json({ 
          error: 'Please check your email to confirm your account before signing in' 
        });
      }
      return res.status(500).json({ error: sessionError?.message || 'Failed to create session' });
    }

    // Return token and user info
    res.status(201).json({
      token: sessionData.session.access_token,
      user: {
        id: data.user.id,
        email: data.user.email,
      },
    });
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
