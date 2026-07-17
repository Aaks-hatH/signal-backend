const express = require('express');
const bcrypt = require('bcrypt');

const router = express.Router();

let cachedHash = null;
async function getAdminPasswordHash() {
  if (cachedHash) return cachedHash;
  const plain = process.env.ADMIN_PASSWORD;
  if (!plain) {
    throw new Error('ADMIN_PASSWORD is not set.');
  }
  cachedHash = await bcrypt.hash(plain, 12);
  return cachedHash;
}

router.get('/login', (req, res) => {
  if (req.session && req.session.isAdmin) {
    return res.redirect('/admin/dashboard');
  }
  res.render('login', { error: null });
});

router.post('/login', async (req, res) => {
  try {
    const { password } = req.body;
    if (!password || typeof password !== 'string') {
      return res.status(400).render('login', { error: 'Password is required.' });
    }

    const hash = await getAdminPasswordHash();
    const match = await bcrypt.compare(password, hash);

    if (!match) {
      return res.status(401).render('login', { error: 'Incorrect password.' });
    }

    req.session.isAdmin = true;
    req.session.loginAt = Date.now();
    return res.redirect('/admin/dashboard');
  } catch (err) {
    console.error('[admin/login] error:', err);
    return res.status(500).render('login', { error: 'Server error. Try again.' });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.redirect('/admin/login');
  });
});

// Convenience GET so a plain link/bookmark can also log out.
router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.redirect('/admin/login');
  });
});

module.exports = router;
