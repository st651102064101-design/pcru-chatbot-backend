const jwt = require('jsonwebtoken');
const secret = process.env.JWT_SECRET || '48e42a421ee05628f999be70dc80b8f1d74fdc50cf1a5f53609db062236d311dfad725fd88c03592a00641786ce2a01eee684adbc4547636edb9297a8e385c38';
const token = jwt.sign({ userId: 999, usertype: 'Admin' }, secret, { expiresIn: '1h' });
console.log(token);
