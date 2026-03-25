import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { History, Search, RotateCcw, Filter, User, Tag, Clock, ChevronRight } from 'lucide-react';
import { logChange } from '@/lib/changeLog';

export default function ChangeLogPage() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tableFilter, setTableFilter] = useState('All');
  const [timeFilter, setTimeFilter] = useState('7'); // days

  const fetchLogs = async () => {
    if (!user) return;
    setLoading(true);
    
    let query = supabase
      .from('change_logs')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (tableFilter !== 'All') {
      query = query.eq('table_name', tableFilter);
    }

    const { data, error } = await query;
    if (error) console.error(error);
    
    // Client side filtering for search and time
    let filtered = data || [];
    
    if (search) {
      filtered = filtered.filter(l => 
        l.description.toLowerCase().includes(search.toLowerCase()) ||
        l.table_name.toLowerCase().includes(search.toLowerCase()) ||
        l.record_id.toLowerCase().includes(search.toLowerCase())
      );
    }

    if (timeFilter !== 'All') {
      const days = parseInt(timeFilter);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      filtered = filtered.filter(l => new Date(l.created_at) > cutoff);
    }

    setLogs(filtered);
    setLoading(false);
  };

  useEffect(() => {
    fetchLogs();
  }, [user, tableFilter, timeFilter]);

  const handleUndo = async (log: any) => {
    if (!confirm('Restore to previous value?')) return;

    try {
      const oldValue = log.old_value ? JSON.parse(log.old_value) : null;
      
      if (log.table_name === 'bookings') {
        const { error } = await supabase
          .from('bookings')
          .update({ [log.field_name]: oldValue })
          .eq('booking_ref', log.record_id);
        if (error) throw error;
      } else if (log.table_name === 'guide_option_rates') {
        // For rates, the record_id is guide_id as per logChange usage #3
        await supabase.from('guide_option_rates').delete().eq('guide_id', log.record_id);
        if (Array.isArray(oldValue) && oldValue.length > 0) {
          await supabase.from('guide_option_rates').insert(oldValue.map((r: any) => ({
            ...r,
            user_id: user?.id,
            guide_id: log.record_id
          })));
        }
      } else if (log.table_name === 'guide_assignments') {
        const { error } = await supabase
          .from('guide_assignments')
          .update({ [log.field_name]: oldValue })
          .eq('id', log.record_id);
        if (error) throw error;
      }

      // Log the undo
      await logChange(supabase, user!.id, {
        tableName: log.table_name,
        recordId: log.record_id,
        description: `Undo: ${log.description}`
      });

      alert('Change reverted successfully');
      fetchLogs();
    } catch (error) {
      console.error('Error undoing change:', error);
      alert('Failed to revert change');
    }
  };

  const isReversible = (log: any) => {
    return ['bookings', 'guide_option_rates', 'guide_assignments'].includes(log.table_name) && log.field_name;
  };

  return (
    <div style={{ padding: '32px' }} className="animate-fade-in">
      <div className="p-8 max-w-6xl mx-auto space-y-8 animate-fade-in">
        
        <div className="flex items-center justify-between border-b border-white/5 pb-6">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">Change Log</h1>
            <p className="text-gray-400 text-sm mt-1">Full audit trail of all changes</p>
          </div>
        </div>

        {/* FILTERS */}
        <div className="flex flex-col md:flex-row gap-4 items-center bg-white/[0.02] p-4 rounded-2xl border border-white/5">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
            <input 
              type="text"
              placeholder="Search audit trail..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="aurelia-input w-full pl-12 h-12"
            />
          </div>
          
          <div className="flex gap-2 w-full md:w-auto">
            <div className="relative flex-1 md:w-40">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={14} />
              <select 
                value={tableFilter}
                onChange={e => setTableFilter(e.target.value)}
                className="aurelia-input w-full pl-9 h-12 appearance-none text-xs font-bold uppercase tracking-widest"
              >
                <option value="All">All Tables</option>
                <option value="bookings">Bookings</option>
                <option value="guides">Guides</option>
                <option value="guide_option_rates">Rates</option>
                <option value="guide_assignments">Assignments</option>
              </select>
            </div>
            
            <div className="relative flex-1 md:w-40">
              <Clock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={14} />
              <select 
                value={timeFilter}
                onChange={e => setTimeFilter(e.target.value)}
                className="aurelia-input w-full pl-9 h-12 appearance-none text-xs font-bold uppercase tracking-widest"
              >
                <option value="1">Last 24h</option>
                <option value="7">Last 7 Days</option>
                <option value="30">Last 30 Days</option>
                <option value="All">All Time</option>
              </select>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center p-20">
            <div className="w-8 h-8 rounded-full border-2 border-gold border-t-transparent animate-spin" />
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-20 border border-dashed border-white/10 rounded-2xl bg-white/[0.02]">
            <History size={48} className="text-gray-700 mb-4" />
            <h3 className="text-xl font-bold mb-1">No logs found</h3>
            <p className="text-gray-500 text-sm">Try adjusting your filters</p>
          </div>
        ) : (
          <div className="aurelia-card border border-white/5 overflow-hidden shadow-2xl">
            <table className="w-full text-left text-sm">
              <thead className="bg-white/5 text-[10px] text-gray-500 font-bold uppercase tracking-widest">
                <tr>
                  <th className="px-6 py-4">When</th>
                  <th className="px-6 py-4">Who</th>
                  <th className="px-6 py-4">What</th>
                  <th className="px-6 py-4">Details</th>
                  <th className="px-6 py-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {logs.map(log => (
                  <tr key={log.id} className="hover:bg-white/[0.01] transition-colors group">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-white font-medium">
                        {new Date(log.created_at).toLocaleDateString()}
                      </div>
                      <div className="text-[10px] text-gray-500 font-mono">
                        {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-gold/10 flex items-center justify-center">
                          <User size={12} className="text-gold" />
                        </div>
                        <span className="font-bold text-xs uppercase tracking-tighter text-gray-400">{log.changed_by}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 min-w-[240px]">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="px-1.5 py-0.5 bg-white/10 rounded text-[9px] font-black uppercase tracking-widest text-gray-400 border border-white/5">
                          {log.table_name}
                        </span>
                        <span className="text-[10px] text-gray-600 font-mono">{log.record_id}</span>
                      </div>
                      <p className="text-white font-medium leading-snug">{log.description}</p>
                    </td>
                    <td className="px-6 py-4">
                      {log.field_name && (
                        <div className="flex items-center gap-2 text-[10px] font-mono">
                          <div className="max-w-[100px] truncate text-red-400/70 line-through bg-red-400/5 px-1.5 py-0.5 rounded">
                            {log.old_value}
                          </div>
                          <ChevronRight size={10} className="text-gray-700" />
                          <div className="max-w-[100px] truncate text-green-400 bg-green-400/5 px-1.5 py-0.5 rounded border border-green-400/10">
                            {log.new_value}
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {isReversible(log) && (
                        <button 
                          onClick={() => handleUndo(log)}
                          className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-[10px] font-black uppercase tracking-widest text-gray-500 hover:text-gold hover:border-gold/30 hover:bg-gold/5 transition-all flex items-center gap-2 ml-auto"
                        >
                          <RotateCcw size={12} />
                          Undo
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
