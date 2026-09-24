import React, { useState, useEffect } from "react";
import { entities } from "@/api/frontendClient";
import { auth } from "@/api/auth";
import { User } from "@/entities/User";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { MessageCircle } from "lucide-react";

export default function ChatWidget({ topic = "Allgemein" }) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [user, setUser] = useState(null);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeUsers, setActiveUsers] = useState([]);
  const [userCache, setUserCache] = useState({});

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const currentUser = await auth.me();
        setUser(currentUser);
      } catch {
        console.log("Benutzer nicht authentifiziert");
      }
    };
    fetchUser();
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadMessages();
      loadActiveUsers();
      // Backend-seitige Realtime-Subscriptions gibt es nicht — neue Nachrichten
      // werden per Polling nachgeladen, solange der Chat geöffnet ist.
      const messageInterval = setInterval(loadMessages, 5000);
      const sessionInterval = setInterval(updateUserSession, 30000);
      return () => {
        clearInterval(messageInterval);
        clearInterval(sessionInterval);
      };
    }
  }, [isOpen, topic]);

  useEffect(() => {
    if (user && isOpen) {
      updateUserSession();
    }
  }, [user, isOpen]);

  const loadMessages = async () => {
    try {
      const data = await entities.ChatMessage.filter({ context: topic }, '-timestamp', 30);

      const newCache = { ...userCache };
      const missingEmails = [...new Set(data.map(m => m.created_by))].filter(e => !newCache[e]);

      if (missingEmails.length > 0) {
        try {
          const allUsers = await User.list('', 1000);
          missingEmails.forEach(email => {
            const foundUser = allUsers.find(u => u.email === email);
            newCache[email] = foundUser?.full_name || email.split('@')[0];
          });
        } catch {
          missingEmails.forEach(email => {
            newCache[email] = email.split('@')[0];
          });
        }
      }

      setUserCache(newCache);
      setMessages(data);
    } catch (e) {
      console.error("Error loading messages:", e);
    }
  };

  const loadActiveUsers = async () => {
    try {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const sessions = await entities.ChatSession.filter({ is_active: true });
      const active = sessions.filter(s => new Date(s.last_activity) > new Date(fiveMinutesAgo));
      setActiveUsers(active);
    } catch (e) {
      console.error("Error loading active users:", e);
    }
  };

  const updateUserSession = async () => {
    if (!user) return;
    try {
      const existing = await entities.ChatSession.filter({ user_email: user.email });
      if (existing.length > 0) {
        await entities.ChatSession.update(existing[0].id, {
          last_activity: new Date().toISOString(),
          is_active: true
        });
      } else {
        await entities.ChatSession.create({
          user_email: user.email,
          user_name: user.full_name || user.email.split('@')[0],
          last_activity: new Date().toISOString(),
          is_active: true
        });
      }
      await loadActiveUsers();
    } catch (e) {
      console.error("Error updating session:", e);
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !user) return;

    setLoading(true);
    try {
      await entities.ChatMessage.create({
        role: "user",
        content: newMessage,
        context: topic,
        timestamp: new Date().toISOString()
      });
      setNewMessage("");
    } catch (e) {
      console.error("Error sending message:", e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 border-slate-700 hover:bg-slate-800">
          <MessageCircle className="w-4 h-4" />
          Chat: {topic}
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-slate-900 border-slate-700 max-w-md">
         <DialogHeader>
           <div className="flex items-center justify-between">
             <DialogTitle className="text-slate-100">Chat - {topic}</DialogTitle>
             <div className="flex items-center gap-2">
               <div className="w-2 h-2 rounded-full bg-green-500"></div>
               <span className="text-xs text-slate-400">{activeUsers.length} online</span>
             </div>
           </div>
           {activeUsers.length > 0 && (
             <div className="mt-2 flex flex-wrap gap-1" aria-live="polite" aria-label="Online Nutzer">
               {activeUsers.map((u) => (
                 <span key={u.id} className="text-xs bg-slate-800 text-slate-300 px-2 py-1 rounded">
                   {u.user_name}
                 </span>
               ))}
             </div>
           )}
         </DialogHeader>

         <div className="h-80 overflow-y-auto space-y-3 mb-4 bg-slate-950 rounded p-3" aria-live="polite" aria-label="Chatnachrichten" role="log">
          {messages.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-8">Keine Nachrichten</p>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`text-sm p-2 rounded ${
                  msg.created_by === user?.email
                    ? "bg-cyan-900 text-cyan-100 ml-4"
                    : "bg-slate-800 text-slate-200 mr-4"
                }`}
              >
                <p className="text-xs opacity-75 mb-1">{userCache[msg.created_by] || msg.created_by}</p>
                <p>{msg.content}</p>
              </div>
            ))
          )}
        </div>

        {user && (
          <div className="flex gap-2">
            <Input
              placeholder="Nachricht schreiben..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              className="bg-slate-800 border-slate-700 text-sm"
            />
            <Button
              onClick={handleSendMessage}
              disabled={!newMessage.trim() || loading}
              size="sm"
              className="bg-cyan-600 hover:bg-cyan-700"
            >
              Senden
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}