import { Entity, PrimaryGeneratedColumn, Column, OneToMany, Index } from 'typeorm';
import { BaseEntity } from './base.entity';
import { ChatMessage } from './chat-message.entity';

@Entity('chat_sessions')
@Index(['tenantId', 'userId'])
@Index(['lastMessageAt'])
export class ChatSession extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'varchar', length: 255 })
  @Index()
  userId: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  title: string | null;

  @Column({ name: 'last_message_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  @Index()
  lastMessageAt: Date;

  @OneToMany(() => ChatMessage, (message) => message.session, { cascade: true })
  messages: ChatMessage[];
}
