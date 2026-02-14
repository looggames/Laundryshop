
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  LayoutDashboard, 
  PlusCircle, 
  Package, 
  Wallet, 
  Search,
  ShoppingCart,
  CheckCircle,
  Clock,
  AlertTriangle,
  Printer,
  Share2,
  Trash2,
  X,
  Repeat,
  Loader2,
  TrendingUp,
  Plus,
  Bell,
  Check,
  Database,
  ExternalLink,
  ChevronLeft,
  User,
  Phone,
  Layers,
  Banknote,
  Send,
  Download,
  Filter,
  Minus,
  Save,
  Edit3,
  Settings2,
  Menu,
  ShieldCheck,
  Zap
} from 'lucide-react';
import { Order, InventoryItem, OrderType, OrderStatus, LaundryItem, PaymentMethod, TwilioConfig } from './types';
import { BarcodeGenerator } from './components/BarcodeGenerator';
import { supabase } from './supabase';
import { generateSmartReminder, MessageContext } from './services/geminiService';
import { sendTwilioWhatsApp } from './services/twilioService';

// Ensure html2pdf is available via window
declare var html2pdf: any;

const INITIAL_ITEMS = [
  { name: 'ثوب', price: 5, icon: '👕' },
  { name: 'غترة/شماغ', price: 3, icon: '🧣' },
  { name: 'قميص', price: 4, icon: '👔' },
  { name: 'بنطلون', price: 4, icon: '👖' },
  { name: 'تيشرت', price: 3, icon: '👕' },
  { name: 'فستان', price: 15, icon: '👗' },
  { name: 'جاكيت', price: 10, icon: '🧥' },
  { name: 'بطانية', price: 25, icon: '🛌' },
  { name: 'سجادة', price: 30, icon: '🧶' },
  { name: 'بدلة كاملة', price: 15, icon: '🤵' },
  { name: 'ملاءة سرير', price: 10, icon: '🛏️' },
];

const TAX_RATE = 0.15;

const statusArabic: Record<OrderStatus, string> = {
  Received: 'تم الاستلام',
  Washing: 'جاري الغسيل',
  Ironing: 'جاري الكي',
  Ready: 'جاهز للاستلام',
  Delivered: 'تم التسليم',
};

const navItems = [
  { id: 'dashboard', label: 'الرئيسية', icon: LayoutDashboard },
  { id: 'new-order', label: 'كاشير جديد', icon: PlusCircle },
  { id: 'orders', label: 'الطلبات', icon: Package },
  { id: 'inventory', label: 'المخزون', icon: Layers },
  { id: 'finance', label: 'الحسابات', icon: Wallet },
  { id: 'settings', label: 'الإعدادات', icon: Settings2 },
];

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'new-order' | 'orders' | 'inventory' | 'finance' | 'settings'>('dashboard');
  const [orders, setOrders] = useState<Order[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveLoading, setSaveLoading] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  const [twilioConfig, setTwilioConfig] = useState<TwilioConfig>({
    accountSid: '',
    authToken: '',
    fromNumber: '',
    enabled: false
  });

  const [categories, setCategories] = useState(INITIAL_ITEMS);
  const [isEditingPrices, setIsEditingPrices] = useState(false);
  const [showCustomItemModal, setShowCustomItemModal] = useState(false);
  const [customItemForm, setCustomItemForm] = useState({ name: '', price: 0 });

  const [sendingMessageIds, setSendingMessageIds] = useState<Set<string>>(new Set());
  const [timeFilter, setTimeFilter] = useState<'all' | '1h' | '24h' | '48h'>('all');
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all');

  const [showPrintModal, setShowPrintModal] = useState<Order | null>(null);
  const [isInvModalOpen, setIsInvModalOpen] = useState(false);
  
  const scanIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    fetchData();
    fetchSettings();
    const savedCats = localStorage.getItem('laundry_categories');
    if (savedCats) setCategories(JSON.parse(savedCats));
  }, []);

  useEffect(() => {
    if (twilioConfig.enabled) {
      scanIntervalRef.current = window.setInterval(checkAndSendAutoReminders, 1000 * 60 * 5);
      return () => { if (scanIntervalRef.current) window.clearInterval(scanIntervalRef.current); };
    }
  }, [twilioConfig, orders]);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase.from('settings').select('value').eq('key', 'twilio').single();
      if (!error && data) {
        setTwilioConfig(data.value);
      }
    } catch (e) {
      console.error("Failed to fetch settings from DB:", e);
    }
  };

  const saveSettingsToDB = async () => {
    setSaveLoading(true);
    try {
      const { error } = await supabase.from('settings').upsert({
        key: 'twilio',
        value: twilioConfig,
        updated_at: new Date().toISOString()
      }, { onConflict: 'key' });

      if (error) throw error;
      alert('تم حفظ الإعدادات في قاعدة البيانات بنجاح ✅');
    } catch (e: any) {
      alert(`فشل حفظ الإعدادات: ${e.message}`);
    } finally {
      setSaveLoading(false);
    }
  };

  const triggerBackgroundNotification = async (order: Order, context: MessageContext) => {
    if (!twilioConfig.enabled || !twilioConfig.accountSid) return;
    try {
      const smartMsg = await generateSmartReminder(order, context);
      const fullMessage = `${smartMsg}\n\n📦 فاتورة: ${order.order_number}\n💰 الإجمالي: ${order.total.toFixed(2)} ريال\n📍 الحالة: ${statusArabic[order.status]}`;
      await sendTwilioWhatsApp(order, fullMessage, twilioConfig);
    } catch (e) {
      console.error("Background notify error:", e);
    }
  };

  const checkAndSendAutoReminders = async () => {
    if (!twilioConfig.enabled || !twilioConfig.accountSid) return;
    const now = Date.now();
    for (const order of orders) {
      if (order.status === 'Delivered') continue;
      
      const orderTime = new Date(order.created_at).getTime();
      const hoursPassed = (now - orderTime) / 3600000;
      
      let key: keyof Order | null = null;
      let context: MessageContext | null = null;

      if (hoursPassed >= 48 && !order.notified_48h) { key = 'notified_48h'; context = 'REMINDER_48H'; }
      else if (hoursPassed >= 24 && !order.notified_24h) { key = 'notified_24h'; context = 'REMINDER_24H'; }
      else if (hoursPassed >= 1 && !order.notified_1h) { key = 'notified_1h'; context = 'REMINDER_1H'; }

      if (key && context) {
        try {
          const smartMsg = await generateSmartReminder(order, context);
          const fullMessage = `${smartMsg}\n\n📦 فاتورة: ${order.order_number}\n💰 الإجمالي: ${order.total.toFixed(2)} ريال\n📍 الحالة: ${statusArabic[order.status]}`;
          const success = await sendTwilioWhatsApp(order, fullMessage, twilioConfig);
          if (success) {
            await supabase.from('orders').update({ [key]: true }).eq('id', order.id);
            setOrders(prev => prev.map(o => o.id === order.id ? { ...o, [key]: true } : o));
          }
        } catch (e) { console.error("Auto Send Fail:", e); }
      }
    }
  };

  const fetchData = async () => {
    setLoading(true);
    setDbError(null);
    try {
      const { data: ordersData, error: ordersError } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
      if (ordersError) throw ordersError;
      setOrders(ordersData || []);
      const { data: inventoryData, error: invError } = await supabase.from('inventory').select('*').order('name');
      if (!invError) setInventory(inventoryData || []);
    } catch (error: any) {
      setDbError(error.message || "فشل الاتصال بقاعدة البيانات");
    } finally {
      setLoading(false);
    }
  };

  const stats = useMemo(() => {
    const totalRevenue = orders.filter(o => o.is_paid).reduce((acc, o) => acc + o.total, 0);
    const taxTotal = orders.filter(o => o.is_paid).reduce((acc, o) => acc + o.tax, 0);
    const pendingAmount = orders.filter(o => !o.is_paid).reduce((acc, o) => acc + o.total, 0);
    const pendingOrdersCount = orders.filter(o => o.status !== 'Delivered').length;
    const lowStockCount = inventory.filter(i => i.stock <= i.threshold).length;
    return { totalRevenue, taxTotal, pendingAmount, pendingOrdersCount, lowStockCount };
  }, [orders, inventory]);

  const [newOrder, setNewOrder] = useState<{
    customer_name: string;
    customer_phone: string;
    order_type: OrderType;
    items: LaundryItem[];
    is_paid: boolean;
    payment_method: PaymentMethod;
    custom_adjustment: number;
  }>({
    customer_name: '',
    customer_phone: '',
    order_type: 'Normal',
    items: [],
    is_paid: false,
    payment_method: 'Cash',
    custom_adjustment: 0
  });

  const currentSubtotal = useMemo(() => {
    const itemsTotal = newOrder.items.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    return itemsTotal + (newOrder.custom_adjustment || 0);
  }, [newOrder.items, newOrder.custom_adjustment]);

  const currentTax = useMemo(() => currentSubtotal * TAX_RATE, [currentSubtotal]);
  const currentTotal = useMemo(() => currentSubtotal + currentTax, [currentSubtotal, currentTax]);

  const togglePredefinedItem = (item: { name: string, price: number }) => {
    if (isEditingPrices) return;
    const existing = newOrder.items.find(i => i.name === item.name && i.price === item.price);
    if (existing) {
      setNewOrder(prev => ({
        ...prev,
        items: prev.items.map(i => (i.name === item.name && i.price === item.price) ? { ...i, quantity: i.quantity + 1 } : i)
      }));
    } else {
      const id = Math.random().toString(36).substr(2, 9);
      setNewOrder(prev => ({
        ...prev,
        items: [...prev.items, { id, name: item.name, quantity: 1, price: item.price }]
      }));
    }
  };

  const handleAddCustomItem = () => {
    if (!customItemForm.name || customItemForm.price <= 0) return alert('يرجى إدخال اسم وسعر صحيح');
    const id = Math.random().toString(36).substr(2, 9);
    setNewOrder(prev => ({
      ...prev,
      items: [...prev.items, { id, name: customItemForm.name, quantity: 1, price: customItemForm.price }]
    }));
    setCustomItemForm({ name: '', price: 0 });
    setShowCustomItemModal(false);
  };

  const updateCategoryPrice = (index: number, newPrice: number) => {
    const updated = [...categories];
    updated[index].price = newPrice;
    setCategories(updated);
    localStorage.setItem('laundry_categories', JSON.stringify(updated));
  };

  const updateItemQuantity = (id: string, delta: number) => {
    setNewOrder(prev => ({
      ...prev,
      items: prev.items.map(i => {
        if (i.id === id) {
          const newQty = Math.max(1, i.quantity + delta);
          return { ...i, quantity: newQty };
        }
        return i;
      })
    }));
  };

  const handleCreateOrder = async () => {
    if (!newOrder.customer_name || !newOrder.customer_phone) return alert('يرجى إدخال اسم العميل ورقم هاتفه');
    if (newOrder.items.length === 0 && newOrder.custom_adjustment === 0) return alert('يرجى إضافة قطعة واحدة على الأقل');
    
    setLoading(true);
    const nowISO = new Date().toISOString();
    
    const orderData = {
      order_number: `ORD-${Date.now().toString().slice(-5)}`,
      customer_name: newOrder.customer_name,
      customer_phone: newOrder.customer_phone,
      order_type: newOrder.order_type,
      items: newOrder.items,
      subtotal: currentSubtotal,
      tax: currentTax,
      total: currentTotal,
      custom_adjustment: newOrder.custom_adjustment,
      is_paid: newOrder.is_paid,
      payment_method: newOrder.payment_method,
      status: 'Received',
      created_at: nowISO,
      updated_at: nowISO
    };

    try {
      const { data, error } = await supabase.from('orders').insert([orderData]).select();
      if (error) throw error;
      
      if (data && data.length > 0) {
        const createdOrder = data[0];
        setOrders([createdOrder, ...orders]);
        setNewOrder({ customer_name: '', customer_phone: '', order_type: 'Normal', items: [], is_paid: false, payment_method: 'Cash', custom_adjustment: 0 });
        setActiveTab('orders');
        setShowPrintModal(createdOrder);

        // Auto msg
        triggerBackgroundNotification(createdOrder, 'RECEIVED');
      }
    } catch (e: any) {
      alert(`فشل الحفظ: ${e.message}`);
    } finally { 
      setLoading(false); 
    }
  };

  const updateOrderStatus = async (id: string, status: OrderStatus) => {
    try {
      const nowISO = new Date().toISOString();
      const { error } = await supabase.from('orders').update({ status, updated_at: nowISO }).eq('id', id);
      if (error) throw error;
      
      const target = orders.find(o => o.id === id);
      if (target) {
        const updated = { ...target, status, updated_at: nowISO };
        setOrders(orders.map(o => o.id === id ? updated : o));
        
        if (status === 'Ready') {
          triggerBackgroundNotification(updated, 'READY');
        }
      }
    } catch (e) { console.error(e); }
  };

  const sendWhatsAppReminder = async (order: Order, context: MessageContext) => {
    if (sendingMessageIds.has(order.id)) return;
    setSendingMessageIds(prev => new Set(prev).add(order.id));
    
    const newWindow = window.open('about:blank', '_blank');
    if (!newWindow) {
      alert('الرجاء السماح بالنوافذ المنبثقة.');
      setSendingMessageIds(prev => { const n = new Set(prev); n.delete(order.id); return n; });
      return;
    }

    try {
      // تمرير السياق المطلوب (RECEIVED أو READY)
      const smartMsg = await generateSmartReminder(order, context);
      const fullMessage = `${smartMsg}\n\n📦 فاتورة: ${order.order_number}\n💰 الإجمالي: ${order.total.toFixed(2)} ريال\n📍 الحالة: ${statusArabic[order.status]}`;
      
      const cleanPhone = order.customer_phone.replace(/\D/g, '');
      const finalPhone = cleanPhone.startsWith('966') ? cleanPhone : `966${cleanPhone.replace(/^0/, '')}`;
      newWindow.location.href = `https://wa.me/${finalPhone}?text=${encodeURIComponent(fullMessage)}`;
    } catch (error) { 
      newWindow.close(); 
      alert("خطأ في معالجة الرسالة."); 
    }
    setSendingMessageIds(prev => { const n = new Set(prev); n.delete(order.id); return n; });
  };

  const handleDownloadPDF = (order: Order) => {
    const element = document.getElementById('print-area');
    if (!element) return;
    
    const opt = {
      margin: [10, 10],
      filename: `Laundry-Invoice-${order.order_number}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, windowWidth: 800 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(element).save();
  };

  const handleUpdateStock = async (id: string, delta: number) => {
    const item = inventory.find(i => i.id === id);
    if (!item) return;
    const newStock = Math.max(0, item.stock + delta);
    try {
      const { error } = await supabase.from('inventory').update({ stock: newStock }).eq('id', id);
      if (error) throw error;
      setInventory(inventory.map(i => i.id === id ? { ...i, stock: newStock } : i));
    } catch (e: any) { alert(e.message); }
  };

  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      const matchesSearch = o.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                           o.order_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           o.customer_phone.includes(searchQuery);
      if (!matchesSearch) return false;
      if (statusFilter !== 'all' && o.status !== statusFilter) return false;
      if (timeFilter !== 'all') {
        const hour = 3600000;
        const day = 86400000;
        const twoDays = 172800000;
        const orderTimestamp = new Date(o.created_at).getTime();
        const passedTimeMs = Date.now() - orderTimestamp;
        if (timeFilter === '1h') return passedTimeMs >= hour && passedTimeMs < day;
        if (timeFilter === '24h') return passedTimeMs >= day && passedTimeMs < twoDays;
        if (timeFilter === '48h') return passedTimeMs >= twoDays;
      }
      return true;
    });
  }, [orders, searchQuery, timeFilter, statusFilter]);

  if (dbError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 p-6">
        <div className="bg-white p-8 rounded-3xl shadow-xl border-t-4 border-red-500 text-center">
          <Database size={48} className="mx-auto text-red-500 mb-4" />
          <h2 className="text-xl font-black mb-4">خطأ في الاتصال</h2>
          <p className="text-slate-500 mb-8">{dbError}</p>
          <button onClick={() => window.location.reload()} className="bg-indigo-600 text-white px-8 py-3 rounded-xl font-bold">تحديث الصفحة</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[#F3F4F6]">
      {/* Sidebar Desktop */}
      <aside className="hidden md:flex flex-col w-24 xl:w-64 bg-white border-l p-4 py-8 sticky top-0 h-screen no-print transition-all">
        <div className="flex items-center justify-center xl:justify-start gap-3 mb-12 px-2">
          <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg"><ShoppingCart size={24} /></div>
          <div className="hidden xl:block"><h1 className="text-lg font-black leading-tight text-slate-800">المغسلة الذكية</h1><p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Laundry Pro v5.8</p></div>
        </div>
        <nav className="space-y-4">
          {navItems.map(item => (
            <button key={item.id} onClick={() => setActiveTab(item.id as any)} className={`w-full flex flex-col xl:flex-row items-center gap-2 xl:gap-4 px-3 py-3 xl:px-5 xl:py-4 rounded-2xl transition-all ${activeTab === item.id ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-100' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-700'}`}>
              <item.icon size={22} /><span className="text-[10px] xl:text-sm font-black">{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      {/* Mobile Navbar */}
      <nav className="md:hidden flex items-center justify-between px-6 py-4 bg-white border-b sticky top-0 z-[150] shadow-sm no-print">
        <div className="flex items-center gap-3"><ShoppingCart size={20} className="text-indigo-600" /><h1 className="text-lg font-black">المغسلة الذكية</h1></div>
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2 text-slate-500"><Menu size={24} /></button>
      </nav>
      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[140] no-print" onClick={() => setIsMobileMenuOpen(false)}>
          <div className="absolute top-20 left-6 right-6 bg-white rounded-[2.5rem] p-8 shadow-2xl" onClick={e => e.stopPropagation()}>
             <div className="space-y-3">
                {navItems.map(item => (
                  <button key={item.id} onClick={() => { setActiveTab(item.id as any); setIsMobileMenuOpen(false); }} className={`w-full flex items-center gap-4 px-6 py-4 rounded-2xl transition-all ${activeTab === item.id ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-50'}`}><item.icon size={22} /><span className="text-sm font-black">{item.label}</span></button>
                ))}
             </div>
          </div>
        </div>
      )}

      {/* Main Container */}
      <main className="flex-1 p-4 lg:p-8 overflow-y-auto no-print">
        <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-8">
          <div><h2 className="text-2xl font-black text-slate-900">{navItems.find(n => n.id === activeTab)?.label}</h2><p className="text-slate-500 text-sm font-medium">{new Date().toLocaleDateString('ar-SA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p></div>
          <div className="flex items-center gap-4">
            <div className="relative flex-1 lg:flex-none">
              <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input type="text" placeholder="رقم الطلب أو العميل..." className="w-full lg:w-72 pr-12 pl-6 py-3.5 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all text-sm font-bold shadow-sm" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            </div>
            <button onClick={fetchData} className="p-3.5 bg-white border border-slate-200 rounded-2xl text-slate-500 hover:bg-slate-50 active:scale-95 transition-all shadow-sm"><Repeat size={20} className={loading ? 'animate-spin' : ''} /></button>
          </div>
        </header>

        {activeTab === 'new-order' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-in fade-in duration-500 max-w-[1600px] mx-auto">
            <div className="lg:col-span-8 bg-white rounded-[2.5rem] p-8 shadow-sm border border-slate-100">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                <h3 className="text-xl font-black flex items-center gap-3"><PlusCircle className="text-indigo-600" /> اختر الملابس</h3>
                <button onClick={() => setIsEditingPrices(!isEditingPrices)} className={`px-5 py-2 rounded-lg text-xs font-black flex items-center gap-2 transition-all ${isEditingPrices ? 'bg-orange-500 text-white' : 'bg-slate-50 text-slate-600 border'}`}><Settings2 size={14} /> {isEditingPrices ? 'حفظ الأسعار' : 'تعديل الأسعار'}</button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 overflow-y-auto max-h-[60vh] pr-2 custom-scrollbar">
                {categories.map((item, idx) => (
                  <div key={idx} className="relative group">
                    <button onClick={() => togglePredefinedItem(item)} className="w-full flex flex-col items-center justify-center p-6 bg-white border border-slate-100 rounded-3xl hover:bg-indigo-600 hover:text-white transition-all active:scale-95 group-button">
                      <span className="text-3xl mb-3">{item.icon}</span>
                      <span className="text-sm font-black mb-1">{item.name}</span>
                      {isEditingPrices ? (
                        <div className="mt-2 flex items-center gap-1 bg-orange-50 p-1 rounded-lg border border-orange-200" onClick={e => e.stopPropagation()}>
                           <input type="number" className="w-12 bg-transparent text-center font-black text-xs text-orange-700 outline-none" value={item.price} onChange={(e) => updateCategoryPrice(idx, parseFloat(e.target.value) || 0)} />
                        </div>
                      ) : <span className="text-[10px] font-bold text-slate-400 group-hover:text-indigo-200">{item.price} ريال</span>}
                    </button>
                  </div>
                ))}
                <button onClick={() => setShowCustomItemModal(true)} className="flex flex-col items-center justify-center p-6 bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl hover:bg-indigo-50 transition-all active:scale-95"><Plus size={24} className="mb-2"/><span className="text-sm font-black">صنف مخصص</span></button>
              </div>
            </div>
            <div className="lg:col-span-4 bg-white rounded-[2.5rem] p-8 shadow-sm border border-slate-100 flex flex-col h-full">
              <h3 className="text-xl font-black mb-6">تفاصيل العميل والطلب</h3>
              <div className="space-y-4 mb-6">
                <div className="relative"><User className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} /><input type="text" placeholder="اسم العميل" className="w-full pr-12 pl-4 py-4 bg-slate-50 border rounded-2xl outline-none font-bold" value={newOrder.customer_name} onChange={e => setNewOrder({...newOrder, customer_name: e.target.value})} /></div>
                <div className="relative text-left"><Phone className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} /><input type="tel" placeholder="رقم الواتساب" className="w-full pr-12 pl-4 py-4 bg-slate-50 border rounded-2xl outline-none font-bold text-left" dir="ltr" value={newOrder.customer_phone} onChange={e => setNewOrder({...newOrder, customer_phone: e.target.value})} /></div>
                <div className="relative"><Banknote className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} /><input type="number" placeholder="سعر مخصص / تعديل" className="w-full pr-12 pl-4 py-4 bg-indigo-50/50 border rounded-2xl outline-none font-bold" value={newOrder.custom_adjustment || ''} onChange={e => setNewOrder({...newOrder, custom_adjustment: parseFloat(e.target.value) || 0})} /></div>
              </div>
              <div className="flex gap-3 mb-6">
                 <button onClick={() => setNewOrder({...newOrder, order_type: 'Normal'})} className={`flex-1 py-3 rounded-xl border font-black ${newOrder.order_type === 'Normal' ? 'bg-indigo-50 border-indigo-500 text-indigo-700' : 'bg-white text-slate-400'}`}>عادي</button>
                 <button onClick={() => setNewOrder({...newOrder, order_type: 'Urgent'})} className={`flex-1 py-3 rounded-xl border font-black ${newOrder.order_type === 'Urgent' ? 'bg-red-50 border-red-500 text-red-700' : 'bg-white text-slate-400'}`}>مستعجل 🔥</button>
              </div>
              <div className="flex-1 overflow-y-auto max-h-[30vh] space-y-3 mb-6 pr-1 custom-scrollbar">
                {newOrder.items.map(item => (
                  <div key={item.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border">
                    <span className="text-sm font-black">{item.name}</span>
                    <div className="flex items-center gap-3">
                      <button onClick={() => updateItemQuantity(item.id, -1)} className="w-8 h-8 bg-white border rounded-lg flex items-center justify-center text-red-500"><Trash2 size={14} /></button>
                      <span className="text-sm font-black">{item.quantity}</span>
                      <button onClick={() => updateItemQuantity(item.id, 1)} className="w-8 h-8 bg-white border rounded-lg flex items-center justify-center text-emerald-500"><Plus size={14} /></button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="bg-[#1E1B4B] text-white p-8 rounded-[2.5rem] shadow-2xl mt-auto">
                 <div className="space-y-3 mb-6">
                    <div className="flex justify-between items-center text-slate-400 text-sm font-bold"><span>المجموع:</span><span>{currentSubtotal.toFixed(2)} ر.س</span></div>
                    <div className="flex justify-between items-end border-t border-white/10 pt-4"><span className="font-black text-xl">الإجمالي</span><span className="font-black text-3xl text-indigo-400">{currentTotal.toFixed(2)} ر.س</span></div>
                 </div>
                 <div className="grid grid-cols-2 gap-3 mb-4">
                    <button onClick={() => setNewOrder({...newOrder, is_paid: !newOrder.is_paid})} className={`py-3 rounded-xl border font-black text-xs ${newOrder.is_paid ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-white/5 border-white/10 text-white'}`}>{newOrder.is_paid ? 'تم السداد ✅' : 'لم يسدد'}</button>
                    {newOrder.is_paid && (
                      <select className="bg-white/10 border border-white/10 rounded-xl py-3 px-3 text-xs font-black text-white" value={newOrder.payment_method} onChange={e => setNewOrder({...newOrder, payment_method: e.target.value as any})}>
                        <option value="Cash" className="text-black">نقدي</option><option value="Card" className="text-black">شبكة</option>
                      </select>
                    )}
                 </div>
                 <button disabled={loading || (newOrder.items.length === 0 && newOrder.custom_adjustment === 0)} onClick={handleCreateOrder} className="w-full bg-white text-indigo-900 py-5 rounded-2xl font-black text-xl hover:bg-indigo-50 active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-30">
                   {loading ? <Loader2 className="animate-spin" /> : <><Printer size={22} /> حفظ وطباعة</>}
                 </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'orders' && (
          <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-3 bg-white border p-2 rounded-2xl">
                 <Filter size={16} className="text-slate-400 mr-2" />
                 <select className="bg-transparent text-sm font-black text-slate-700 outline-none" value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)}>
                    <option value="all">كل الحالات</option>{Object.entries(statusArabic).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                 </select>
              </div>
              <div className="flex gap-2 p-1.5 bg-white rounded-2xl border overflow-x-auto">
                {['all', '1h', '24h', '48h'].map(f => (
                  <button key={f} onClick={() => setTimeFilter(f as any)} className={`px-6 py-2.5 rounded-xl text-xs font-black transition-all ${timeFilter === f ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500'}`}>{f === 'all' ? 'الكل' : `+${f}`}</button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredOrders.map(order => (
                <div key={order.id} className="bg-white border-2 border-slate-50 rounded-[2.5rem] p-7 hover:border-indigo-100 transition-all group">
                   <div className="flex justify-between mb-4"><span className="text-[10px] font-mono bg-slate-50 px-2 py-1 rounded">#{order.order_number}</span><span className={`px-3 py-1 rounded-full text-[10px] font-black ${order.order_type === 'Urgent' ? 'bg-red-50 text-red-600 animate-pulse' : 'bg-slate-50 text-slate-400'}`}>{order.order_type === 'Urgent' ? 'مستعجل 🔥' : 'عادي'}</span></div>
                   <h4 className="font-black text-xl mb-1">{order.customer_name}</h4>
                   <p className="text-sm font-bold text-indigo-500 mb-6">{order.customer_phone}</p>
                   <div className="grid grid-cols-2 gap-3 mb-6 p-4 bg-slate-50 rounded-3xl border">
                      <div><p className="text-[9px] font-black text-slate-400 uppercase mb-1">الحالة</p><select className="w-full bg-transparent font-black text-indigo-700 text-xs outline-none" value={order.status} onChange={e => updateOrderStatus(order.id, e.target.value as any)}>{Object.entries(statusArabic).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                      <div className="text-left border-r pr-3 border-slate-200"><p className="text-[9px] font-black text-slate-400 uppercase mb-1">الإجمالي</p><p className={`text-sm font-black ${order.is_paid ? 'text-emerald-600' : 'text-red-500'}`}>{order.total.toFixed(2)} ر.س</p></div>
                   </div>
                   <div className="grid grid-cols-3 gap-3">
                      <button onClick={() => setShowPrintModal(order)} className="p-4 bg-white border rounded-2xl flex items-center justify-center text-slate-500 hover:text-indigo-600 transition-all"><Printer size={20} /></button>
                      <button onClick={() => sendWhatsAppReminder(order, 'READY')} className="p-4 bg-white border rounded-2xl flex items-center justify-center text-slate-500 hover:text-emerald-600 transition-all"><Send size={20} /></button>
                      <button onClick={() => updateOrderStatus(order.id, 'Delivered')} className="p-4 bg-indigo-600 text-white rounded-2xl flex items-center justify-center shadow-lg active:scale-95 transition-all"><CheckCircle size={20} /></button>
                   </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'inventory' && (
          <div className="space-y-6 animate-in zoom-in-95 duration-500">
            <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-slate-100">
               <div className="flex items-center justify-between mb-10"><h3 className="text-xl font-black">المواد الاستهلاكية</h3><button onClick={() => setIsInvModalOpen(true)} className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-2xl font-black text-sm"><Plus size={18} /> إضافة مادة</button></div>
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                 {inventory.map(item => (
                   <div key={item.id} className="bg-white border-2 border-slate-50 rounded-[2.5rem] p-8 hover:border-indigo-100 transition-all">
                     <div className="flex justify-between items-center mb-6"><div className="p-4 bg-indigo-50 text-indigo-600 rounded-2xl"><Layers size={24} /></div><div className="flex gap-2"><button className="p-2 text-slate-400"><Edit3 size={18} /></button></div></div>
                     <h4 className="text-lg font-black text-slate-800 mb-1">{item.name}</h4>
                     <p className="text-4xl font-black text-indigo-600 mb-8">{item.stock} <span className="text-sm font-bold text-slate-400">{item.unit}</span></p>
                     <div className="flex gap-2"><button onClick={() => handleUpdateStock(item.id, 1)} className="flex-1 bg-slate-100 py-3 rounded-xl font-bold flex items-center justify-center gap-2"><Plus size={16} /> زيادة</button><button onClick={() => handleUpdateStock(item.id, -1)} className="flex-1 bg-white border py-3 rounded-xl font-bold flex items-center justify-center gap-2"><Minus size={16} /> نقص</button></div>
                   </div>
                 ))}
               </div>
            </div>
          </div>
        )}

        {activeTab === 'finance' && (
          <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
             <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 bg-white rounded-[2.5rem] p-8 shadow-sm border border-slate-100">
                   <h3 className="text-xl font-black mb-8">الأداء المالي</h3>
                   <div className="h-64 bg-slate-50 rounded-[2rem] border-2 border-dashed flex items-center justify-center p-8 text-center text-slate-400 font-bold"><TrendingUp size={48} className="text-indigo-600 mr-4 opacity-40" /> الرسوم البيانية تتطلب بيانات أكثر للتحليل..</div>
                </div>
                <div className="bg-[#1E1B4B] text-white rounded-[2.5rem] p-10 shadow-2xl space-y-8">
                   <h3 className="text-xl font-black flex items-center gap-3"><Wallet className="text-indigo-400" /> ملخص الخزينة</h3>
                   <div className="border-b border-white/10 pb-6"><p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">إجمالي المبيعات</p><p className="text-4xl font-black text-indigo-400">{stats.totalRevenue.toFixed(2)} <span className="text-xs">ر.س</span></p></div>
                   <div className="border-b border-white/10 pb-6"><p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">المبالغ غير المحصلة</p><p className="text-3xl font-black text-red-400">{stats.pendingAmount.toFixed(2)} <span className="text-xs">ر.س</span></p></div>
                </div>
             </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="max-w-4xl mx-auto space-y-8 animate-in slide-in-from-bottom-4 duration-500">
            <div className="bg-white rounded-[2.5rem] p-10 shadow-sm border border-slate-100">
              <div className="flex items-center gap-4 mb-10"><div className="p-4 bg-indigo-50 text-indigo-600 rounded-3xl"><Settings2 size={32} /></div><div><h3 className="text-2xl font-black text-slate-900">إعدادات Twilio</h3><p className="text-slate-400 font-bold text-sm">لإرسال إشعارات الواتساب التلقائية في الخلفية</p></div></div>
              <div className="space-y-6">
                 <div className="flex items-center justify-between mb-4"><h4 className="text-lg font-black flex items-center gap-2"><Zap className="text-orange-500" /> تفعيل الإرسال التلقائي</h4><input type="checkbox" checked={twilioConfig.enabled} onChange={e => setTwilioConfig({...twilioConfig, enabled: e.target.checked})} className="w-6 h-6 accent-indigo-600" /></div>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-8 bg-slate-50 rounded-[2rem] border">
                    <div className="space-y-2"><label className="text-xs font-black text-slate-400 uppercase">Account SID</label><input type="text" className="w-full px-6 py-4 bg-white border rounded-2xl font-mono text-sm" value={twilioConfig.accountSid} onChange={e => setTwilioConfig({...twilioConfig, accountSid: e.target.value})} /></div>
                    <div className="space-y-2"><label className="text-xs font-black text-slate-400 uppercase">Auth Token</label><input type="password" className="w-full px-6 py-4 bg-white border rounded-2xl font-mono text-sm" value={twilioConfig.authToken} onChange={e => setTwilioConfig({...twilioConfig, authToken: e.target.value})} /></div>
                    <div className="space-y-2"><label className="text-xs font-black text-slate-400 uppercase">Twilio Phone (WhatsApp)</label><input type="text" className="w-full px-6 py-4 bg-white border rounded-2xl font-mono text-sm" placeholder="+14155238886" value={twilioConfig.fromNumber} onChange={e => setTwilioConfig({...twilioConfig, fromNumber: e.target.value})} /></div>
                 </div>
                 <button disabled={saveLoading} onClick={saveSettingsToDB} className="w-full bg-indigo-600 text-white py-5 rounded-[2rem] font-black text-xl flex items-center justify-center gap-3 active:scale-[0.98] transition-all">
                   {saveLoading ? <Loader2 className="animate-spin" /> : <><Save size={24} /> حفظ الإعدادات</>}
                 </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'dashboard' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 animate-in slide-in-from-bottom-4">
             {[
               { label: 'صافي الدخل', value: `${stats.totalRevenue.toFixed(2)} ر.س`, icon: Banknote, color: 'text-emerald-600', bg: 'bg-emerald-50' },
               { label: 'طلبات جارية', value: stats.pendingOrdersCount, icon: Clock, color: 'text-indigo-600', bg: 'bg-indigo-50' },
               { label: 'مبالغ معلقة', value: `${stats.pendingAmount.toFixed(2)} ر.س`, icon: Wallet, color: 'text-orange-600', bg: 'bg-orange-50' },
               { label: 'نقص المخزون', value: stats.lowStockCount, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50' },
             ].map((s, i) => (
               <div key={i} className="bg-white p-6 rounded-[2rem] border shadow-sm group hover:scale-105 transition-all">
                 <div className={`p-4 ${s.bg} ${s.color} rounded-2xl w-fit mb-4`}><s.icon size={24} /></div>
                 <p className="text-slate-400 text-[10px] font-black uppercase mb-1">{s.label}</p>
                 <p className="text-2xl font-black text-slate-800">{s.value}</p>
               </div>
             ))}
          </div>
        )}
      </main>

      {/* Modals */}
      {showCustomItemModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[200] p-4">
           <div className="bg-white rounded-[3rem] w-full max-w-sm p-8 shadow-2xl animate-in zoom-in-95">
              <h3 className="text-xl font-black mb-6">صنف مخصص</h3>
              <input type="text" placeholder="اسم الصنف" className="w-full px-5 py-4 bg-slate-50 border rounded-2xl mb-4 outline-none font-bold" value={customItemForm.name} onChange={e => setCustomItemForm({...customItemForm, name: e.target.value})} />
              <input type="number" placeholder="السعر" className="w-full px-5 py-4 bg-slate-50 border rounded-2xl mb-8 outline-none font-bold" value={customItemForm.price || ''} onChange={e => setCustomItemForm({...customItemForm, price: parseFloat(e.target.value) || 0})} />
              <button onClick={handleAddCustomItem} className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black">إضافة للسلة</button>
           </div>
        </div>
      )}

      {showPrintModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-[200] p-4 no-print">
          <div className="bg-white rounded-[3rem] w-full max-w-lg p-10 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button onClick={() => setShowPrintModal(null)} className="absolute top-8 left-8 p-3 bg-slate-100 rounded-2xl text-slate-500"><X size={20} /></button>
            <div id="print-area" className="text-center bg-white p-6 rounded-3xl">
              <div className="mb-8"><div className="w-16 h-16 bg-slate-900 text-white rounded-2xl flex items-center justify-center mx-auto mb-4 text-3xl font-black">M</div><h2 className="text-2xl font-black mb-1">مغسلة التميز الذكية</h2></div>
              <div className="border-y border-slate-100 py-6 mb-8 text-right space-y-3">
                <div className="flex justify-between items-center text-xs"><span>العميل:</span><span className="font-black">{showPrintModal.customer_name}</span></div>
                <div className="flex justify-between items-center text-xs"><span>رقم الهاتف:</span><span dir="ltr" className="font-bold">{showPrintModal.customer_phone}</span></div>
                <div className="flex justify-between items-center text-xs"><span>رقم الفاتورة:</span><span className="font-mono font-black">{showPrintModal.order_number}</span></div>
                <div className="flex justify-between items-center text-xs"><span>التاريخ:</span><span className="font-bold">{new Date(showPrintModal.created_at).toLocaleString('ar-SA')}</span></div>
              </div>
              <div className="space-y-4 mb-10 text-right">
                {showPrintModal.items.map(item => (
                  <div key={item.id} className="flex justify-between items-center text-sm"><span>{item.name} x{item.quantity}</span><span>{(item.price * item.quantity).toFixed(2)} ر.س</span></div>
                ))}
              </div>
              <div className="bg-slate-50 p-8 rounded-[2.5rem] border mb-10"><div className="flex justify-between text-2xl font-black pt-4"><span>الإجمالي</span><span className="text-indigo-600">{showPrintModal.total.toFixed(2)} ر.س</span></div></div>
              <BarcodeGenerator value={showPrintModal.order_number} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-8">
              <button onClick={() => window.print()} className="bg-indigo-600 text-white py-5 rounded-2xl font-black text-lg shadow-xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-3"><Printer size={22}/> طباعة</button>
              <button onClick={() => handleDownloadPDF(showPrintModal)} className="bg-orange-500 text-white py-5 rounded-2xl font-black text-lg shadow-xl hover:bg-orange-600 transition-all flex items-center justify-center gap-3"><Download size={22}/> تحميل PDF</button>
              {/* هنا نرسل RECEIVED لأننا في الفاتورة */}
              <button onClick={() => sendWhatsAppReminder(showPrintModal, 'RECEIVED')} className="bg-emerald-500 text-white py-5 rounded-2xl font-black text-lg shadow-xl hover:bg-emerald-600 transition-all flex items-center justify-center gap-3 sm:col-span-2"><Send size={22}/> إرسال واتساب يدوي</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
