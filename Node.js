// server.js - Main backend server
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Connect to MongoDB (using free MongoDB Atlas cluster)
mongoose.connect('mongodb+srv://drmzhaider:<haider250>@testcluster1.frcjvgh.mongodb.net/?retryWrites=true&w=majority&appName=TestCluster1', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

// User Schema
const UserSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
  createdAt: { type: Date, default: Date.now }
});

// Contract Template Schema
const TemplateSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  name: String,
  type: String,
  content: Object,
  createdAt: { type: Date, default: Date.now }
});

// Contract Schema
const ContractSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  title: String,
  content: String,
  clientName: String,
  providerName: String,
  status: { type: String, default: 'draft' },
  collaborators: [String],
  signatures: [{
    name: String,
    signature: String,
    signedAt: Date
  }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Clause Library Schema
const ClauseSchema = new mongoose.Schema({
  title: String,
  content: String,
  category: String,
  isPublic: { type: Boolean, default: true }
});

// Models
const User = mongoose.model('User', UserSchema);
const Template = mongoose.model('Template', TemplateSchema);
const Contract = mongoose.model('Contract', ContractSchema);
const Clause = mongoose.model('Clause', ClauseSchema);

// JWT Secret
const JWT_SECRET = 'your_jwt_secret_here';

// Auth Middleware
const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization').replace('Bearer ', '');
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) throw new Error();
    req.user = user;
    next();
  } catch (error) {
    res.status(401).send({ error: 'Please authenticate.' });
  }
};

// Routes

// User Registration
app.post('/api/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    
    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).send({ error: 'User already exists' });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create user
    const user = new User({ name, email, password: hashedPassword });
    await user.save();
    
    // Generate token
    const token = jwt.sign({ id: user._id }, JWT_SECRET);
    
    res.status(201).send({ user: { id: user._id, name, email }, token });
  } catch (error) {
    res.status(400).send({ error: error.message });
  }
});

// User Login
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).send({ error: 'Invalid credentials' });
    }
    
    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).send({ error: 'Invalid credentials' });
    }
    
    // Generate token
    const token = jwt.sign({ id: user._id }, JWT_SECRET);
    
    res.send({ user: { id: user._id, name: user.name, email }, token });
  } catch (error) {
    res.status(400).send({ error: error.message });
  }
});

// Get user templates
app.get('/api/templates', auth, async (req, res) => {
  try {
    const templates = await Template.find({ userId: req.user._id });
    res.send(templates);
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

// Save template
app.post('/api/templates', auth, async (req, res) => {
  try {
    const { name, type, content } = req.body;
    const template = new Template({ userId: req.user._id, name, type, content });
    await template.save();
    res.status(201).send(template);
  } catch (error) {
    res.status(400).send({ error: error.message });
  }
});

// Get user contracts
app.get('/api/contracts', auth, async (req, res) => {
  try {
    const contracts = await Contract.find({ 
      $or: [
        { userId: req.user._id },
        { collaborators: req.user.email }
      ]
    });
    res.send(contracts);
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

// Save contract
app.post('/api/contracts', auth, async (req, res) => {
  try {
    const { title, content, clientName, providerName, collaborators } = req.body;
    const contract = new Contract({ 
      userId: req.user._id, 
      title, 
      content, 
      clientName, 
      providerName, 
      collaborators 
    });
    await contract.save();
    res.status(201).send(contract);
  } catch (error) {
    res.status(400).send({ error: error.message });
  }
});

// Update contract
app.put('/api/contracts/:id', auth, async (req, res) => {
  try {
    const { title, content, clientName, providerName, collaborators } = req.body;
    const contract = await Contract.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { title, content, clientName, providerName, collaborators, updatedAt: Date.now() },
      { new: true }
    );
    if (!contract) {
      return res.status(404).send({ error: 'Contract not found' });
    }
    res.send(contract);
  } catch (error) {
    res.status(400).send({ error: error.message });
  }
});

// Add signature to contract
app.post('/api/contracts/:id/sign', auth, async (req, res) => {
  try {
    const { name, signature } = req.body;
    const contract = await Contract.findOne({ 
      _id: req.params.id,
      $or: [
        { userId: req.user._id },
        { collaborators: req.user.email }
      ]
    });
    
    if (!contract) {
      return res.status(404).send({ error: 'Contract not found' });
    }
    
    contract.signatures.push({ name, signature, signedAt: new Date() });
    contract.status = 'signed';
    await contract.save();
    
    res.send(contract);
  } catch (error) {
    res.status(400).send({ error: error.message });
  }
});

// Get clause library
app.get('/api/clauses', async (req, res) => {
  try {
    const clauses = await Clause.find({ isPublic: true });
    res.send(clauses);
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

// AI Suggestion endpoint (simulated)
app.post('/api/ai-suggestions', auth, async (req, res) => {
  try {
    const { context, type } = req.body;
    
    // In a real implementation, this would call an AI API
    // For now, we'll return simulated suggestions
    const suggestions = {
      confidentiality: "Both parties agree to keep confidential any proprietary information received from the other party during the term of this agreement.",
      termination: "Either party may terminate this agreement with 30 days written notice to the other party.",
      payment: "The client agrees to pay the provider $X upon completion of the deliverables outlined in this agreement.",
      liability: "In no event shall either party be liable for any indirect, special, incidental, or consequential damages."
    };
    
    res.send({ suggestion: suggestions[type] || "No suggestion available" });
  } catch (error) {
    res.status(400).send({ error: error.message });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
